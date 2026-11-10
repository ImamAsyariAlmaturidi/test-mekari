"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Icon } from "../../components/Icons";
import { getEvaluation, startEvaluation, type EvaluationCaseResult, type EvaluationReport, type EvaluationResult } from "../../lib/api";
import { useTenantKey } from "../../lib/tenant";

const pct = (value: number | null) => value === null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;

export default function EvaluationPage() {
  const { apiKey } = useTenantKey();
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [caseMode, setCaseMode] = useState<"model_a" | "model_b">("model_a");
  const [openCase, setOpenCase] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setReport(await getEvaluation()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load evaluation results"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (report?.job?.status !== "running") return;
    const timer = window.setInterval(() => { void load(); }, 2000);
    return () => window.clearInterval(timer);
  }, [report?.job?.status, load]);

  async function runEvaluation() {
    if (!apiKey || starting || report?.job?.status === "running") return;
    setStarting(true); setError(null);
    try {
      const { job } = await startEvaluation(apiKey);
      setReport((current) => ({ ...(current ?? { available: false }), job }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start evaluation"); void load(); }
    finally { setStarting(false); }
  }

  const modelA = report?.results?.find((item) => item.mode === "model_a");
  const modelB = report?.results?.find((item) => item.mode === "model_b");
  const caseResults = report?.results?.find((item) => item.mode === caseMode)?.caseResults ?? [];
  const rows: { label: string; key: keyof EvaluationResult; format: (result: EvaluationResult) => string; delta?: (a: EvaluationResult, b: EvaluationResult) => string }[] = [
    { label: "Intent accuracy", key: "intentAccuracy", format: (result) => pct(result.intentAccuracy), delta: (a, b) => signed((b.intentAccuracy - a.intentAccuracy) * 100) },
    { label: "Retrieval intent match", key: "retrievalIntentMatchRate", format: (result) => pct(result.retrievalIntentMatchRate), delta: (a, b) => signed((b.retrievalIntentMatchRate - a.retrievalIntentMatchRate) * 100) },
    { label: "Refusal rate", key: "refusalRate", format: (result) => pct(result.refusalRate), delta: (a, b) => signed((b.refusalRate - a.refusalRate) * 100) },
    { label: "Answer quality · embedding cosine", key: "answerQuality", format: (result) => result.answerQuality?.toFixed(3) ?? "Unavailable", delta: (a, b) => a.answerQuality === null || b.answerQuality === null ? "Unavailable" : signed((b.answerQuality - a.answerQuality) * 100) },
    { label: "Average latency", key: "averageLatencyMs", format: (result) => `${Math.round(result.averageLatencyMs).toLocaleString()} ms` },
    { label: "Total estimated cost", key: "totalCostUsd", format: (result) => `$${result.totalCostUsd.toFixed(5)}` }
  ];

  return <div className="page-stack">
    <section className="page-intro"><div><p className="section-kicker">Quality measurement</p><h1 className="page-title">Evaluation</h1><p>Compare <code>OPENROUTER_MODEL</code> and <code>OPENROUTER_FALLBACK_MODEL</code> on identical held-out Bitext cases. Uses provider credits.</p></div><div className="evaluation-actions"><Button onClick={load} disabled={loading}><Icon name="refresh" />Refresh</Button><Button onClick={runEvaluation} disabled={!apiKey || starting || report?.job?.status === "running"}>{report?.job?.status === "running" ? "Evaluation running…" : starting ? "Starting…" : "Run evaluation"}</Button></div></section>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    {!apiKey ? <div className="error-banner" role="status">Select a tenant with a valid API key to run an evaluation.</div> : null}
    {report?.job ? <Card className={`evaluation-job ${report.job.status}`}><div><b>{report.job.status === "running" ? `Evaluating ${report.job.model}` : report.job.status === "completed" ? "Evaluation complete" : "Evaluation failed"}</b><span>{report.job.status === "running" ? `${report.job.completedCases} / ${report.job.totalCases} cases · uses provider API credits` : report.job.finishedAt ? new Date(report.job.finishedAt).toLocaleString() : ""}</span></div>{report.job.status === "running" ? <progress max={report.job.totalCases} value={report.job.completedCases} aria-label="Evaluation case progress" /> : null}</Card> : null}
    {loading && !report ? <Card className="evaluation-empty">Loading evaluation results…</Card> : null}
    {report && !report.available ? <Card className="evaluation-empty"><h2>No evaluation results yet</h2><p>Run the held-out Bitext evaluation to populate this page with measured results.</p><code>npm run evaluate</code></Card> : null}
    {modelA && modelB ? <>
      <section className="metric-grid evaluation-metrics">
        <Metric label="Held-out cases" value={String(report?.cases ?? modelA.cases)} />
        <Metric label="Intents covered" value={String(modelA.intents)} />
        <Metric label={`Model A · ${modelA.model}`} value={pct(modelA.intentAccuracy)} />
        <Metric label={`Model B · ${modelB.model}`} value={pct(modelB.intentAccuracy)} />
      </section>
      <Card className="evaluation-table-card"><div className="panel-heading"><div><p className="section-kicker">Model comparison</p><h2>Model A vs Model B</h2></div><span className="table-note">{modelA.cases} cases per model</span></div>
        <div className="table-wrap"><table className="evaluation-table"><thead><tr><th>Metric</th><th>{modelA.model}</th><th>{modelB.model}</th><th>Change · B − A</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.format(modelA)}</td><td>{row.format(modelB)}</td><td>{row.delta ? row.delta(modelA, modelB) : "—"}</td></tr>)}</tbody></table></div>
      </Card>
      <Card className="evaluation-cases-card">
        <div className="panel-heading"><div><p className="section-kicker">Per-case results</p><h2>Held-out test cases</h2></div><div className="evaluation-case-controls" aria-label="Compared model">{([["model_a", modelA.model], ["model_b", modelB.model]] as const).map(([mode]) => <button key={mode} type="button" aria-pressed={caseMode === mode} onClick={() => { setCaseMode(mode); setOpenCase(null); }}>{mode === "model_a" ? "Model A" : "Model B"}</button>)}</div></div>
        {caseResults.length ? <div className="table-wrap"><table className="evaluation-cases-table"><thead><tr><th>#</th><th>Question</th><th>Expected intent</th><th>Predicted intent</th><th>Retrieval</th><th>Outcome</th></tr></thead><tbody>{caseResults.map((item) => <EvaluationCaseRow key={`${caseMode}-${item.index}`} item={item} isOpen={openCase === item.index} onToggle={() => setOpenCase(openCase === item.index ? null : item.index)} />)}</tbody></table></div> : <p className="evaluation-cases-empty">Per-case details are not present in this saved run. Run the evaluation again to record them.</p>}
      </Card>
      <Card className="evaluation-method"><div className="panel-heading"><div><p className="section-kicker">Method</p><h2>How to read these results</h2></div></div><ul>
        <li>Both models use the same original held-out question, retrieved evidence, and prompt; only the answer model changes.</li>
        <li>Intent accuracy compares the detected intent with the Bitext label. Retrieval intent match checks whether any retrieved entry has that label.</li>
        <li>Answer similarity is embedding cosine against the Bitext reference answer; it is a proxy, not a human quality score.</li>
        <li>Latency and cost include evidence assessment and answer generation. Refused cases may skip answer generation.</li>
      </ul><p className="metric-footnote">Source: {report?.source ?? "held-out evaluation dataset"}{report?.generatedAt ? ` · Generated ${new Date(report.generatedAt).toLocaleString()}` : ""}. {modelB.answerQualityMethod}</p></Card>
    </> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>; }

function EvaluationCaseRow({ item, isOpen, onToggle }: { item: EvaluationCaseResult; isOpen: boolean; onToggle: () => void }) {
  return <>
    <tr>
      <td>{item.index}</td>
      <td><button type="button" className="evaluation-case-question" aria-expanded={isOpen} onClick={onToggle}>{item.question}</button></td>
      <td><code>{item.expectedIntent}</code></td>
      <td><code>{item.predictedIntent}</code>{!item.intentCorrect ? <span className="case-mismatch">Mismatch</span> : null}</td>
      <td><span className={`case-result ${item.retrievalIntentMatch ? "matched" : "unmatched"}`}>{item.retrievalIntentMatch ? "Matched" : "No match"}</span></td>
      <td><span className={`case-result ${item.refused ? "refused" : "answered"}`}>{item.refused ? "Refused" : "Answered"}</span></td>
    </tr>
    {isOpen ? <tr className="evaluation-case-detail"><td colSpan={6}>
      <div className="evaluation-case-detail-grid">
        <section><h3>Query and intent</h3><p><b>Original:</b> {item.question}</p>{item.queryRewriteUsed ? <p><b>Rewritten query:</b> {item.rewrittenQuery}</p> : null}<p><b>Expected:</b> {item.expectedIntent} · <b>Predicted:</b> {item.predictedIntent}</p><p><b>Retrieval intent match:</b> {item.retrievalIntentMatch ? "Yes" : "No"}</p><p><b>Refusal reason:</b> {item.refusalReason ?? "—"}</p></section>
        <section><h3>Inference</h3><p><b>Model:</b> {item.model} · {item.provider}</p><p><b>Answer similarity:</b> {item.answerSimilarity === null ? "Unavailable" : item.answerSimilarity.toFixed(3)}</p><p><b>Latency:</b> {item.latencyMs.toLocaleString()} ms · <b>Estimated cost:</b> ${item.costUsd.toFixed(5)}</p><p className="evaluation-case-answer">{item.answer}</p></section>
        <section className="evaluation-case-sources"><h3>Retrieved evidence · {item.retrievedEntries.length}</h3>{item.evidenceAssessment ? <p><b>Evidence assessment:</b> {item.evidenceAssessment.reason}</p> : null}{item.retrievedEntries.length ? item.retrievedEntries.map((entry, index) => <article key={`${item.index}-${entry.question}`}><div><b>{entry.intent}</b><span>{Math.round(entry.score * 100)}% · {entry.retrievalMethod ?? "unknown"}</span></div><p><b>Q:</b> {entry.question}</p><p><b>A:</b> {entry.answer}</p></article>) : <p>No entries retrieved.</p>}</section>
      </div>
    </td></tr> : null}
  </>;
}
