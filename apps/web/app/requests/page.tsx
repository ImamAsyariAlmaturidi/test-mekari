"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCoreRowModel, getSortedRowModel, useLegacyTable, type LegacyCell, type LegacyColumnDef } from "@tanstack/react-table/legacy";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Icon } from "../../components/Icons";
import { getJson, type RequestDetail, type RequestLog } from "../../lib/api";
import { useTenantKey } from "../../lib/tenant";

const statusLabels: Record<string, string> = { success: "Success", refused: "Refused", error: "Failed", quota_exceeded: "Quota exceeded" };
const maskKey = (key: string) => key ? `••••••••${key.slice(-4)}` : "Unavailable";

export default function RequestsPage() {
  const { apiKey } = useTenantKey();
  const [requests, setRequests] = useState<RequestLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pageSize = 20;
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  async function load() {
    if (!apiKey) return;
    setLoading(true); setError(null); setRequests(null);
    try {
      const data = await getJson<{ tenant: string; requests: RequestLog[] }>("/v1/requests", apiKey);
      setRequests(data.requests.map((request) => ({ ...request, tenant: data.tenant })));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to load request logs";
      setError(message);
      toast.error("Could not load request logs", { description: message });
    } finally { setLoading(false); }
  }

  useEffect(() => { setSelectedId(null); setPage(1); void load(); }, [apiKey]);
  const providers = [...new Set(requests?.map((request) => request.provider ?? request.primary_model).filter(Boolean) ?? [])];
  const filtered = useMemo(() => (requests ?? []).filter((request) =>
    (status === "all" || request.outcome === status) &&
    (provider === "all" || (request.provider ?? request.primary_model) === provider) &&
    request.id.toLowerCase().includes(search.trim().toLowerCase())
  ), [requests, status, provider, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return <div className="page-stack">
    <section className="page-intro"><p>Latest 100 recorded attempts for the active tenant.</p><Button onClick={load} disabled={loading}><Icon name="refresh" />Refresh</Button></section>
    <div className="key-notice compact"><Icon name="key" /><span><b>Tenant API key</b><small>{maskKey(apiKey)}</small></span><span className="table-note">Selected in the header</span></div>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    <Card className="logs-panel"><div className="panel-heading"><div><p className="section-kicker">Inference activity</p><h2>Request logs</h2></div><span className="table-note">{filtered.length} matching requests</span></div>
      <div className="request-filters" role="search" aria-label="Filter request logs">
        <input className="request-search" type="search" placeholder="Search request ID" aria-label="Search request ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="success">Success</option><option value="refused">Refused</option><option value="error">Failed</option><option value="quota_exceeded">Quota exceeded</option></select>
        <select aria-label="Filter by provider" value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }}><option value="all">All providers</option>{providers.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      </div>
      {loading && !requests ? <p className="empty-state">Loading request history…</p> : requests?.length === 0 ? <p className="empty-state">No requests recorded for this tenant yet.</p> : requests && filtered.length === 0 ? <p className="empty-state">No requests match these filters.</p> : requests ? <>
        <RequestTable requests={visible} openRequest={setSelectedId} />
        <div className="pagination"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} · latest 100 loaded</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next</button></div></div>
      </> : null}
    </Card>
    {selectedId ? <RequestDrawer key={`${apiKey}:${selectedId}`} id={selectedId} apiKey={apiKey} close={closeDrawer} /> : null}
  </div>;
}

function RequestTable({ requests, openRequest }: { requests: RequestLog[]; openRequest(id: string): void }) {
  const columns: LegacyColumnDef<RequestLog>[] = [
    { accessorKey: "created_at", header: "Timestamp" }, { accessorKey: "id", header: "Request ID" },
    { accessorKey: "tenant", header: "Tenant" }, { accessorKey: "model", header: "Model" },
    { accessorKey: "outcome", header: "Status" }, { accessorKey: "input_tokens", header: "Input tokens" },
    { accessorKey: "output_tokens", header: "Output tokens" }, { accessorKey: "latency_ms", header: "Latency" },
    { accessorKey: "cost_usd", header: "Est. cost" }, { accessorKey: "fallback_used", header: "Fallback" }
  ];
  const table = useLegacyTable({ data: requests, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return <div className="table-wrap"><table><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : <button className="sort-head" onClick={header.column.getToggleSortingHandler()}>{String(header.column.columnDef.header)}{header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}</button>}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}><CellValue cell={cell} openRequest={openRequest} /></td>)}</tr>)}</tbody></table></div>;
}

function CellValue({ cell, openRequest }: { cell: LegacyCell<RequestLog>; openRequest(id: string): void }) {
  const request = cell.row.original;
  switch (cell.column.id) {
    case "created_at": return new Date(request.created_at).toLocaleString();
    case "id": return <button type="button" className="request-id-button" onClick={() => openRequest(request.id)} title={`Inspect request ${request.id}`}>{request.id.slice(0, 8)}</button>;
    case "outcome": return <span className={`status-badge ${request.outcome}`}>{statusLabels[request.outcome] ?? request.outcome.replaceAll("_", " ")}</span>;
    case "input_tokens": return <>{request.input_tokens.toLocaleString()}{request.usage_estimated ? "*" : ""}</>;
    case "output_tokens": return <>{request.output_tokens.toLocaleString()}{request.usage_estimated ? "*" : ""}</>;
    case "latency_ms": return `${request.latency_ms.toLocaleString()} ms`;
    case "cost_usd": return <>{`$${request.cost_usd.toFixed(5)}`}{request.cost_estimated ? "*" : ""}</>;
    case "fallback_used": return request.fallback_used ? <span title={request.fallback_reason ?? "Fallback attempted"}>Used</span> : "—";
    default: return String(cell.getValue() ?? "—");
  }
}

function RequestDrawer({ id, apiKey, close }: { id: string; apiKey: string; close(): void }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    void getJson<{ tenant: string; request: RequestDetail }>(`/v1/requests/${id}`, apiKey).then((data) => setDetail({ ...data.request, tenant: data.tenant })).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load request details"));
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [id, apiKey, close]);
  const routingState = !detail ? "Loading" : detail.routing_decision || (detail.fallback_used ? detail.outcome === "error" ? "Fallback attempted but failed" : "Fallback served the response" : detail.outcome === "error" ? "Primary inference failed" : "Primary served the response");
  return <>
    <button className="drawer-backdrop" type="button" aria-label="Close request details" onClick={close} />
    <aside className="request-drawer" role="dialog" aria-modal="true" aria-labelledby="request-drawer-title">
      <header className="request-drawer-head"><div><p className="section-kicker">Request details</p><h2 id="request-drawer-title">Request #{id.slice(0, 8)}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close request details"><X /></button></header>
      {error ? <p className="error-banner m-5" role="alert">{error}</p> : !detail ? <p className="drawer-loading">Loading request details…</p> : <div className="request-drawer-body">
        <section className="drawer-section"><div className="panel-heading !border-0 !p-0"><h3>Overview</h3><span className={`status-badge ${detail.outcome}`}>{statusLabels[detail.outcome] ?? detail.outcome}</span></div><dl className="drawer-list">
          <Detail label="Request ID" value={detail.id} /><Detail label="Tenant" value={detail.tenant} /><Detail label="Timestamp" value={new Date(detail.created_at).toLocaleString()} /><Detail label="Model served" value={detail.model} /><Detail label="Serving provider" value={detail.provider ?? "Unavailable"} /><Detail label="Intent" value={detail.intent ?? "Unavailable"} /><Detail label="Confidence signal" value={detail.confidence === null ? "Unavailable" : `${Math.round(detail.confidence * 100)}%`} /><Detail label="Retrieval confidence" value={detail.retrieval_confidence === null ? "Unavailable" : `${Math.round(detail.retrieval_confidence * 100)}%`} /><Detail label="Refusal reason" value={detail.refusal_reason ?? "—"} /><Detail label="Rewritten query" value={detail.rewritten_query ?? "Unavailable"} /><Detail label="Evidence assessment" value={detail.evidence_assessment?.reason ?? "Unavailable"} /><Detail label="Input tokens" value={`${detail.input_tokens.toLocaleString()}${detail.usage_estimated ? " (estimated)" : ""}`} /><Detail label="Output tokens" value={`${detail.output_tokens.toLocaleString()}${detail.usage_estimated ? " (estimated)" : ""}`} /><Detail label="Latency" value={`${detail.latency_ms.toLocaleString()} ms`} /><Detail label="Cost" value={`$${detail.cost_usd.toFixed(6)}${detail.cost_estimated ? " (estimated / unreported)" : ""}`} />
        </dl></section>
        <section className="drawer-section"><h3>Routing trace</h3><dl className="drawer-list"><Detail label="Strategy" value={detail.routing_strategy} /><Detail label="Selected backend" value={detail.selected_backend ?? detail.primary_model} /><Detail label="Routing reason" value={detail.routing_reason} /><Detail label="Final backend" value={detail.final_backend ?? detail.provider ?? "Not run"} /><Detail label="Decision" value={routingState} />{detail.fallback_used ? <Detail label="Fallback reason" value={detail.fallback_reason ?? "Unavailable"} /> : null}</dl></section>
        {detail.error_message ? <section className="drawer-section"><h3>Error details</h3><p className="drawer-error">{detail.error_message}</p></section> : null}
        <section className="drawer-section"><h3>Retrieved knowledge</h3>{detail.retrieved_entries?.length ? detail.retrieved_entries.map((entry, index) => <article className="drawer-source" key={`${entry.question}-${index}`}><div><b>{entry.intent}</b><span>{Math.round(entry.score * 100)}% similarity</span></div><p>{entry.question}</p><p>{entry.answer}</p></article>) : <p className="empty-inline">No retrieved knowledge was recorded for this request.</p>}</section>
      </div>}
    </aside>
  </>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><span>{value}</span></div>; }
