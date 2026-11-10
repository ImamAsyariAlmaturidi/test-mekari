"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuiIf, ActionBarPrimitive, AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  ThreadPrimitive, useExternalStoreRuntime,
  type AppendMessage, type ThreadMessageLike
} from "@assistant-ui/react";
import { ArrowUp, Copy, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { getConversation, getJson, type RequestDone, type RequestMeta, type RoutingStrategy, type SupportSuggestion, streamChat } from "../lib/api";
import { applyAssistantStreamEvent } from "../lib/chat-stream";
import { useTenantKey } from "../lib/tenant";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: Date };
const convertMessage = (message: Message): ThreadMessageLike => ({
  id: message.id, role: message.role, content: [{ type: "text", text: message.content }], createdAt: message.createdAt
});
const unavailable = <span className="unavailable">—</span>;

export default function Playground() {
  const { apiKey } = useTenantKey();
  const [tenant, setTenant] = useState("Tenant");
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>("balanced");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<RequestMeta | null>(null);
  const [done, setDone] = useState<RequestDone | null>(null);
  const [refusedMessageId, setRefusedMessageId] = useState<string | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [authStatus, setAuthStatus] = useState<"checking" | "valid" | "invalid" | "unavailable">("checking");
  const [suggestions, setSuggestions] = useState<SupportSuggestion[]>([]);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [sourcesByMessage, setSourcesByMessage] = useState<Record<string, RequestMeta["entries"]>>({});
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [receivedFirstToken, setReceivedFirstToken] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const tenantKeyRef = useRef("");
  const activeRequestRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestStatus = error ? "error" : loading ? "running" : done?.outcome ?? "idle";
  const generationSkipped = meta?.routingDecision.startsWith("refused_") ?? false;

  useEffect(() => {
    const id = localStorage.getItem("mini-router-conversation-id") ?? crypto.randomUUID();
    localStorage.setItem("mini-router-conversation-id", id);
    setConversationId(id);
  }, []);
  useEffect(() => {
    if (!conversationId || !apiKey) return;
    getConversation(conversationId, apiKey).then(({ messages: history }) => setMessages(history.map((message) => ({ ...message, id: crypto.randomUUID(), createdAt: new Date() })))).catch((caught) => {
      if (!(caught instanceof Error && caught.message === "Conversation not found")) setError(caught instanceof Error ? caught.message : "Unable to load conversation");
    });
  }, [conversationId, apiKey]);
  useEffect(() => {
    if (!apiKey) return;
    if (tenantKeyRef.current && tenantKeyRef.current !== apiKey) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setLoading(false); setMessages([]); setMeta(null); setDone(null); setRefusedMessageId(null); setStreamingMessageId(null); setSourcesByMessage({}); setError(null);
      const id = crypto.randomUUID();
      localStorage.setItem("mini-router-conversation-id", id);
      setConversationId(id);
    }
    tenantKeyRef.current = apiKey;
  }, [apiKey]);
  useEffect(() => {
    if (!apiKey) { setAuthStatus("unavailable"); setTenant("No tenant selected"); setRemainingQuota(null); setSuggestions([]); setSuggestionsError(false); return; }
    setAuthStatus("checking");
    getJson<{ tenant: string; remainingQuota: number }>("/v1/usage", apiKey).then((usage) => { setTenant(usage.tenant); setRemainingQuota(usage.remainingQuota); setAuthStatus("valid"); }).catch((caught) => { const message = caught instanceof Error ? caught.message : ""; setTenant(message.includes("Invalid or missing") ? "Invalid tenant key" : "API unavailable"); setRemainingQuota(null); setAuthStatus(message.includes("Invalid or missing") ? "invalid" : "unavailable"); });
    setSuggestionsError(false);
    getJson<{ suggestions: SupportSuggestion[] }>("/v1/suggestions", apiKey).then((result) => setSuggestions(result.suggestions)).catch(() => { setSuggestions([]); setSuggestionsError(true); });
  }, [apiKey]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("").trim();
    if (text.length < 3 || !conversationId || authStatus !== "valid") return;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setError(null); setMeta(null); setDone(null); setRefusedMessageId(null); setStreamingMessageId(assistantId); setReceivedFirstToken(false); setLoading(true);
    setMessages((items) => [...items, { id: userId, role: "user", content: text, createdAt: new Date() }, { id: assistantId, role: "assistant", content: "", createdAt: new Date() }]);
    try {
      await streamChat(text, apiKey, conversationId, (eventName, payload) => {
        if (eventName === "meta") { const requestMeta = payload as RequestMeta; setMeta(requestMeta); setSourcesByMessage((items) => ({ ...items, [assistantId]: requestMeta.entries })); }
        if (eventName === "delta" || eventName === "reset") { if (eventName === "delta") setReceivedFirstToken(true); setMessages((items) => applyAssistantStreamEvent(items, assistantId, eventName, (payload as { text?: string }).text)); }
        if (eventName === "done") {
          const result = payload as RequestDone;
          setDone(result);
          setRemainingQuota(result.remainingQuota);
          if (result.outcome === "refused") setRefusedMessageId(assistantId);
        }
        if (eventName === "error") {
          const message = (payload as { error: string }).error;
          setError(message); toast.error("Inference request failed", { description: message });
        }
      }, controller.signal, routingStrategy);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message = caught instanceof Error ? caught.message : "Request failed";
      setError(message); toast.error("Inference request failed", { description: message });
      setMessages((items) => items.filter((item) => item.id !== assistantId));
    } finally { if (activeRequestRef.current === controller) { activeRequestRef.current = null; setStreamingMessageId(null); setLoading(false); } }
  }, [apiKey, authStatus, conversationId, routingStrategy]);

  const runtime = useExternalStoreRuntime({ messages, convertMessage, onNew, isRunning: loading });
  function newConversation() {
    if (loading) return;
    const id = crypto.randomUUID();
    localStorage.setItem("mini-router-conversation-id", id);
    setConversationId(id); setMessages([]); setMeta(null); setDone(null); setError(null); setSourcesByMessage({});
  }

  return <div className="playground-layout">
    <section className="panel conversation-panel">
      <div className="tenant-context"><span className="tenant-avatar">{tenant.slice(0, 1).toUpperCase()}</span><span><div className="tenant-name-row"><b>{tenant}</b><div className="flex items-center gap-2"><label className="routing-strategy-control"><span>Routing</span><select aria-label="Routing strategy" value={routingStrategy} disabled={loading} onChange={(event) => setRoutingStrategy(event.target.value as RoutingStrategy)}><option value="balanced">Balanced</option><option value="cost_optimized">Cost optimized</option></select></label><Button onClick={newConversation} disabled={loading}>New conversation</Button></div></div><small><span className={`api-key-status ${authStatus}`} />{authStatus === "checking" ? "Checking tenant API key…" : authStatus === "valid" ? "Tenant API key valid" : authStatus === "invalid" ? "Tenant API key rejected" : "API unavailable"} · {remainingQuota === null ? "quota unavailable" : `${remainingQuota.toLocaleString()} requests remaining`}</small></span></div>
      {error ? <div className="error-banner mx-4 mt-3" role="alert">{error}</div> : null}
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="assistant-thread">
          <ThreadPrimitive.Viewport className="assistant-transcript" aria-live="polite">
              <AuiIf condition={(state) => state.thread.isEmpty}>
                <div className="assistant-empty-state"><h2>Where should we begin?</h2><div className="support-suggestions" aria-label="Suggested questions from the current knowledge base">{suggestions.map((suggestion) => <ThreadPrimitive.Suggestion key={suggestion.prompt} prompt={suggestion.prompt} send className="suggestion-chip">{suggestion.label}</ThreadPrimitive.Suggestion>)}{!suggestions.length ? <p>{suggestionsError ? "Could not load suggestions. Check the API connection and try again." : authStatus === "valid" ? "No eligible questions found in the current knowledge base." : "Select a tenant to load supported example questions."}</p> : null}</div><p>Suggested prompts are sampled from the current knowledge base.</p></div>
              </AuiIf>
              <ThreadPrimitive.Messages>{({ message }) => <MessagePrimitive.Root className={`chat-message ${message.role}`}><div className={message.role === "user" ? "user-bubble" : "assistant-message-content"}><MessagePrimitive.Parts />{message.id === streamingMessageId && loading ? <span className="streaming-indicator"><LoaderCircle />{receivedFirstToken ? "Generating response…" : "Searching knowledge base…"}</span> : null}</div>{message.role === "assistant" && sourcesByMessage[message.id]?.length ? <MessageSources entries={sourcesByMessage[message.id]} /> : null}{message.id === refusedMessageId ? <div className="low-confidence-note"><b>{meta?.refusalReason === "evidence_check_failed" ? "Evidence check unavailable" : "Not enough support information"}</b><span>{meta?.evidenceAssessment?.reason ?? "I couldn’t find reliable support information to answer. Try a more specific question or contact support."}</span></div> : null}<ActionBarPrimitive.Root autohide="always" className="chat-message-actions"><ActionBarPrimitive.Copy asChild><button type="button" aria-label="Copy message" title="Copy message"><Copy /></button></ActionBarPrimitive.Copy></ActionBarPrimitive.Root></MessagePrimitive.Root>}</ThreadPrimitive.Messages>
              <ThreadPrimitive.ViewportFooter className="chat-sticky-footer"><ChatComposer loading={loading || authStatus !== "valid"} /><p>AI responses can be inaccurate. Check important support details.</p></ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </section>
    <aside className="inspector" aria-label="Inference inspector">
      <div className="inspector-title"><div><p className="section-kicker">Selected request</p><h2>Inference inspector</h2></div><span className={`status-badge ${requestStatus}`}>{requestStatus}</span></div>
      <InspectorSection title="Overview"><Definition label="Request ID" value={done ? <span className="request-id-value"><code title={done.requestId}>{done.requestId.slice(0, 8)}</code><button type="button" className="copy-id" aria-label="Copy request ID" title="Copy request ID" onClick={() => { void navigator.clipboard.writeText(done.requestId).then(() => toast.success("Request ID copied")).catch(() => toast.error("Could not copy request ID")); }}><Copy /></button></span> : unavailable} /><Definition label="Status" value={done?.outcome ?? (loading ? "Streaming" : unavailable)} /><Definition label="Model" value={meta?.model ?? unavailable} /><Definition label="Provider" value={meta?.provider ?? unavailable} /><Definition label="Total latency" value={done ? `${done.latencyMs} ms` : unavailable} /><Definition label="Input / output" value={done ? `${done.inputTokens} / ${done.outputTokens}` : unavailable} /><Definition label="Estimated cost" value={done ? `$${done.costUsd.toFixed(5)}` : unavailable} /></InspectorSection>
      <InspectorSection title="Routing"><div className="routing-timeline"><div className={meta && !generationSkipped ? "route-step complete" : "route-step"}><span /><div><b>{generationSkipped ? "Primary configured" : "Selected backend"}</b><small>{meta?.selectedBackend ?? "Waiting for request"}</small></div></div><div className={`route-connector ${meta?.fallbackUsed ? "fallback" : ""}`} /><div className={meta?.fallbackUsed ? "route-step complete fallback" : meta && !generationSkipped ? "route-step complete" : "route-step"}><span /><div><b>{meta?.fallbackUsed ? "Fallback served" : generationSkipped ? "Generation skipped" : "Final backend"}</b><small>{generationSkipped ? "Evidence check refused before answer generation" : meta?.finalBackend ?? "Backend selected after routing"}</small></div></div></div><Definition label="Strategy" value={meta?.routingStrategy ?? unavailable} /><Definition label="Routing reason" value={meta?.routingReason ?? unavailable} /><Definition label="Fallback reason" value={meta?.fallbackReason ?? unavailable} /><Definition label="Decision" value={meta?.routingDecision ?? unavailable} /></InspectorSection>
      <InspectorSection title="Support evidence"><Definition label="Intent" value={meta?.intent ?? unavailable} /><Definition label="Confidence signal" value={meta ? `${Math.round(meta.confidence * 100)}%` : unavailable} /><Definition label="Retrieval confidence" value={meta ? `${Math.round(meta.retrievalConfidence * 100)}%` : unavailable} /><Definition label="Retrieval method" value={meta?.retrievalMethod ?? unavailable} /><Definition label="Query rewritten" value={meta ? meta.queryRewriteUsed ? "Yes" : "No" : unavailable} /><Definition label="Refusal reason" value={meta?.refusalReason ?? unavailable} /><p className="decision-basis">{meta?.evidenceAssessment?.reason ?? (meta ? "No pre-generation evidence check was required." : "Decision basis unavailable until a request completes.")}</p><div className="retrieval-list"><button type="button" className="retrieval-toggle" aria-expanded={sourcesOpen} aria-controls="retrieved-sources" onClick={() => setSourcesOpen((open) => !open)}>Retrieved sources <span>{meta ? meta.entries.length : "—"}</span></button>{sourcesOpen ? <div id="retrieved-sources">{meta?.entries.length ? meta.entries.map((entry) => <article key={entry.question}><div><b>{entry.intent}</b><span>{Math.round(entry.score * 100)}% similarity</span></div><p>{entry.question}</p><p className="source-answer">{entry.answer}</p></article>) : <p className="empty-inline">{meta ? "No knowledge entries were retrieved." : "Sources appear after a request."}</p>}</div> : null}</div></InspectorSection>
      <InspectorSection title="Request details"><Definition label="Timestamp" value={done ? new Date(done.timestamp).toLocaleString() : unavailable} /><Definition label="Outcome" value={done?.outcome ?? unavailable} /><Definition label="Error" value={error ?? unavailable} /></InspectorSection>
    </aside>
  </div>;
}

function ChatComposer({ loading }: { loading: boolean }) {
  const [text, setText] = useState("");
  const tooShort = text.trim().length < 3;
  return <ComposerPrimitive.Root className="chat-composer">
    <div className="chat-composer-row">
      <ComposerPrimitive.Input placeholder="Ask a customer support question…" aria-label="Customer message" rows={1} onChange={(event) => setText(event.target.value)} className="chat-composer-input" />
      <ComposerPrimitive.Send disabled={loading || tooShort} className="chat-send-button" aria-label={loading ? "Generating response" : "Send message"} title={tooShort ? "Enter at least 3 characters" : loading ? "Generating response" : "Send message"}><ArrowUp /></ComposerPrimitive.Send>
    </div>
    {tooShort && text.length > 0 ? <span className="composer-validation">Please enter at least 3 characters.</span> : null}
  </ComposerPrimitive.Root>;
}

function MessageSources({ entries }: { entries: RequestMeta["entries"] }) {
  return <details className="message-sources"><summary>Sources <span>{entries.length}</span></summary><div className="message-source-grid">{entries.slice(0, 3).map((entry) => <article className="message-source-card" key={entry.id ?? entry.question}><div><b>{entry.intent.replaceAll("_", " ")}</b><span>{Math.round(entry.score * 100)}% match</span></div><strong>{entry.question}</strong><p>{entry.answer}</p></article>)}</div></details>;
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="inspector-section"><h3>{title}</h3><div className="definition-list">{children}</div></section>; }
function Definition({ label, value }: { label: string; value: React.ReactNode }) { return <div><span className="detail-label">{label}</span><span className="detail-value">{value}</span></div>; }
