"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Icon } from "../../components/Icons";
import { getJson, type Analytics } from "../../lib/api";
import { useTenantKey } from "../../lib/tenant";

const outcomeLabels: Record<string, string> = { success: "Successful", refused: "Refused", error: "Failed", quota_exceeded: "Quota rejected" };

export default function UsagePage() {
  const { apiKey } = useTenantKey();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!apiKey) return;
    setLoading(true); setError(null);
    try { setData(await getJson<Analytics>("/v1/analytics", apiKey)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load analytics"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [apiKey]);
  const metrics = data ? [
    { label: "Gateway requests · all time", value: data.requests.toLocaleString() },
    { label: "Tokens", value: (data.input_tokens + data.output_tokens).toLocaleString() },
    { label: "Estimated cost", value: `$${data.cost_usd.toFixed(4)}` },
    { label: "Average latency", value: `${data.average_latency_ms.toLocaleString()} ms` },
    { label: "P95 latency", value: `${data.p95_latency_ms.toLocaleString()} ms` },
    { label: "Fallback requests", value: `${data.fallback_requests} · ${data.requests ? Math.round(data.fallback_requests / data.requests * 100) : 0}%` }
  ] : [];
  const hasDaily = Boolean(data?.daily.some((day) => day.requests > 0));
  const quotaPercent = data && data.quotaLimit > 0 ? Math.min(100, data.quotaUsed / data.quotaLimit * 100) : 0;

  return <div className="page-stack">
    <section className="page-intro"><p>Lifetime totals for the selected tenant. Charts show the last 7 days.</p><Button onClick={load} disabled={loading}><Icon name="refresh" />Refresh</Button></section>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    <section className="metric-grid">{loading && !data ? <LoadingCards count={6} /> : metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}</section>
    {data ? <>
      <section className="usage-breakdowns">
        <Card className="breakdown-card"><div className="panel-heading"><div><p className="section-kicker">All recorded gateway attempts</p><h2>Request outcomes</h2></div><span className="table-note">{data.requests.toLocaleString()} total</span></div>
          <div className="outcome-list">{data.outcomes.length ? data.outcomes.map((item) => <div className="outcome-row" key={item.outcome}><span className={`outcome-marker ${item.outcome}`} /><span>{outcomeLabels[item.outcome] ?? item.outcome.replaceAll("_", " ")}</span><b>{item.requests.toLocaleString()}</b></div>) : <p className="chart-empty">No requests recorded yet.</p>}</div>
          <div className="breakdown-footnote">Quota rejected requests are logged as attempts and do not consume quota.</div>
        </Card>
        <Card className="breakdown-card"><div className="panel-heading"><div><p className="section-kicker">Tenant quota</p><h2>{data.quotaUsed.toLocaleString()} / {data.quotaLimit.toLocaleString()} used</h2></div><span className="table-note">{data.remainingQuota.toLocaleString()} remaining</span></div>
          <div className="quota-progress" role="progressbar" aria-label="Quota used" aria-valuemin={0} aria-valuemax={data.quotaLimit} aria-valuenow={data.quotaUsed}><span style={{ width: `${quotaPercent}%` }} /></div>
          <div className="quota-details"><span>{quotaPercent.toFixed(0)}% used</span><span>Lifetime quota · no automatic reset</span></div>
          <div className="breakdown-footnote">Quota increments when a request reserves capacity. Rejected attempts are logged separately; older requests may predate complete metering logs.</div>
        </Card>
      </section>
      {(data.estimated_usage_requests > 0 || data.estimated_cost_requests > 0) ? <p className="metric-footnote">Estimates present: token usage for {data.estimated_usage_requests} request(s); cost for {data.estimated_cost_requests} request(s). Provider usage is used when available.</p> : <p className="metric-footnote">Token counts are provider-reported. Cost is estimated from configured model rates when provider cost is unavailable.</p>}
      {data.fallback_requests > 0 ? <p className="metric-footnote">Fallback requests are counted once. Charges from a failed primary attempt are excluded if that provider did not return usage or cost.</p> : null}
      {data.failed_requests > 0 ? <p className="metric-footnote">Failed requests may have incurred provider charges that were not returned by the provider; those costs are not included.</p> : null}
      <section className="usage-charts">
        <Card className="chart-panel"><div className="panel-heading"><div><p className="section-kicker">Last 7 days</p><h2>Requests</h2></div></div>{hasDaily ? <><ResponsiveContainer width="100%" height={210}><BarChart data={data.daily} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}><CartesianGrid vertical={false} stroke="#e6e8eb" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} tickLine={false} axisLine={false} fontSize={11} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} /><Tooltip /><Bar dataKey="requests" name="Requests" fill="#167d68" radius={[3, 3, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer><p className="chart-caption">Days without activity are shown as zero.</p></> : <p className="chart-empty">No requests recorded in the last 7 days.</p>}</Card>
        <Card className="chart-panel"><div className="panel-heading"><div><p className="section-kicker">Last 7 days</p><h2>Estimated cost</h2></div></div>{hasDaily ? <><ResponsiveContainer width="100%" height={210}><BarChart data={data.daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="#e6e8eb" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} tickLine={false} axisLine={false} fontSize={11} /><YAxis tickFormatter={(value: number) => `$${value.toFixed(4)}`} tickLine={false} axisLine={false} fontSize={10} width={64} /><Tooltip formatter={(value) => [`$${Number(value).toFixed(6)}`, "Estimated cost"]} /><Bar dataKey="cost_usd" name="Estimated cost" fill="#5b78c8" radius={[3, 3, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer><p className="chart-caption">Days without activity are shown as zero.</p></> : <p className="chart-empty">No cost data recorded in the last 7 days.</p>}</Card>
        <Card className="chart-panel"><div className="panel-heading"><div><p className="section-kicker">All recorded requests</p><h2>Provider usage</h2></div></div>{data.providers.length ? <ResponsiveContainer width="100%" height={210}><BarChart data={data.providers} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 12 }}><CartesianGrid horizontal={false} stroke="#e6e8eb" strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} /><YAxis type="category" dataKey="provider" width={108} tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Bar dataKey="requests" name="Requests" fill="#5b78c8" radius={[0, 3, 3, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer> : <p className="chart-empty">No provider usage recorded yet.</p>}</Card>
        <Card className="chart-panel"><div className="panel-heading"><div><p className="section-kicker">All recorded requests</p><h2>Model usage</h2></div></div>{data.models.length ? <ResponsiveContainer width="100%" height={210}><BarChart data={data.models} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 12 }}><CartesianGrid horizontal={false} stroke="#e6e8eb" strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} /><YAxis type="category" dataKey="model" width={108} tickLine={false} axisLine={false} fontSize={10} /><Tooltip /><Bar dataKey="requests" name="Requests" fill="#167d68" radius={[0, 3, 3, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer> : <p className="chart-empty">No model usage recorded yet.</p>}</Card>
      </section>
      <Card className="usage-table"><div className="panel-heading"><div><p className="section-kicker">Tenant usage</p><h2>Current tenant</h2></div><span className="table-note">Live database aggregate</span></div><div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Estimated cost</th><th>Quota used</th><th>Remaining quota</th></tr></thead><tbody><tr><td><span className="tenant-cell"><span className="tenant-avatar">{data.tenant.slice(0, 1).toUpperCase()}</span>{data.tenant}</span></td><td>{data.requests}</td><td>{data.input_tokens.toLocaleString()}</td><td>{data.output_tokens.toLocaleString()}</td><td>${data.cost_usd.toFixed(4)}</td><td>{data.quotaUsed} / {data.quotaLimit}</td><td>{data.remainingQuota}</td></tr></tbody></table></div></Card>
    </> : null}
  </div>;
}

function LoadingCards({ count }: { count: number }) { return <>{Array.from({ length: count }, (_, index) => <article className="metric-card skeleton" key={index}><span /><strong /></article>)}</>; }
