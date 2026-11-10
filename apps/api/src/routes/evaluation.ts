import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../services/auth.js";
import { env } from "../config.js";

type EvaluationJob = { id: string; status: "running" | "completed" | "failed"; mode: "direct" | "rewrite"; completedCases: number; totalCases: number; startedAt: string; finishedAt?: string };
const inDist = import.meta.url.includes("/dist/");
const resultsFile = new URL(inDist ? "../../../../../evaluation-results.json" : "../../../../evaluation-results.json", import.meta.url);
const projectRoot = fileURLToPath(new URL(inDist ? "../../../../../" : "../../../../", import.meta.url));
const runnerFile = fileURLToPath(new URL(inDist ? "../../db/scripts/evaluate.js" : "../../db/scripts/evaluate.ts", import.meta.url));
let latestJob: EvaluationJob | null = null;
let running = false;

export async function evaluationRoutes(app: FastifyInstance) {
  app.get("/v1/evaluation", async () => {
    try { return { ...JSON.parse(await readFile(resultsFile, "utf8")), available: true, job: latestJob }; }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { available: false, job: latestJob };
      app.log.error({ err: error }, "Could not read evaluation report");
      return { error: "Evaluation results could not be read" };
    }
  });

  app.post("/v1/evaluation/run", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    if (!await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey)) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    if (running) return reply.code(409).send({ error: "An evaluation is already running", job: latestJob });
    if (!env.OPENROUTER_API_KEY) return reply.code(503).send({ error: "Evaluation requires an OpenRouter API key" });

    running = true;
    latestJob = { id: randomUUID(), status: "running", mode: "direct", completedCases: 0, totalCases: 30, startedAt: new Date().toISOString() };
    const job = latestJob;
    const child = spawn(process.execPath, inDist ? [runnerFile] : ["--import", "tsx", runnerFile], { cwd: projectRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const progress = JSON.parse(line) as { type?: string; mode?: EvaluationJob["mode"]; completed?: number; total?: number };
          if (progress.type === "progress" && latestJob?.id === job.id) latestJob = { ...job, mode: progress.mode ?? job.mode, completedCases: progress.completed ?? job.completedCases, totalCases: progress.total ?? job.totalCases };
        } catch { /* Ignore evaluation table output; progress lines are JSON. */ }
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-2_000); });
    child.on("error", (error) => {
      app.log.error({ err: error }, "Could not start evaluation process");
      if (latestJob?.id === job.id) latestJob = { ...job, status: "failed", finishedAt: new Date().toISOString() };
      running = false;
    });
    child.on("close", (code) => {
      if (latestJob?.id === job.id) latestJob = { ...latestJob, status: code === 0 ? "completed" : "failed", finishedAt: new Date().toISOString(), ...(code === 0 ? { completedCases: latestJob.totalCases } : {}) };
      if (code !== 0) app.log.error({ code, stderr: stderr.slice(-1_000) }, "Evaluation process failed");
      running = false;
    });
    return reply.code(202).send({ job });
  });
}
