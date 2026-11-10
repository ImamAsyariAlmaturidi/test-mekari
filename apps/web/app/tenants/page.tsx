"use client";

import { useEffect, useState } from "react";
import { Card } from "../../components/ui/card";
import { getJson } from "../../lib/api";
import { useTenants } from "../../lib/tenant";

type TenantUsage = { tenant: string; requests: number; costUsd: number; quotaLimit: number; quotaUsed: number; remainingQuota: number };
type TenantRow = { name: string; apiKey: string; usage?: TenantUsage; error?: string };

export default function TenantsPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenants } = useTenants();

  useEffect(() => {
    setLoading(true);
    void Promise.all(tenants.map(async (tenant): Promise<TenantRow> => {
      try { return { ...tenant, usage: await getJson<TenantUsage>("/v1/usage", tenant.apiKey) }; }
      catch (error) { return { ...tenant, error: error instanceof Error ? error.message : "Usage unavailable" }; }
    })).then(setRows).finally(() => setLoading(false));
  }, [tenants]);

  const available = rows.flatMap((row) => row.usage ? [row.usage] : []);
  const totals = available.reduce((sum, usage) => ({ requests: sum.requests + usage.requests, cost: sum.cost + usage.costUsd }), { requests: 0, cost: 0 });
  return <div className="page-stack">
    <section className="page-intro"><p>Demo tenants with independently scoped API keys and quotas.</p><span className="table-note">Usage from authenticated tenant APIs</span></section>
    <section className="metric-grid tenant-metrics">
      <Metric label="Total tenants" value={loading ? "Loading…" : rows.length} />
      <Metric label="Requests" value={loading ? "Loading…" : totals.requests.toLocaleString()} />
      <Metric label="Total cost" value={loading ? "Loading…" : `$${totals.cost.toFixed(4)}`} />
    </section>
    <Card className="usage-table"><div className="panel-heading"><div><p className="section-kicker">Tenant access</p><h2>Tenants & quotas</h2></div><span className="table-note">Keys are masked</span></div>
      <div className="table-wrap"><table className="tenants-table"><thead><tr><th>Tenant</th><th>API key</th><th>Usage / quota</th><th>Requests</th><th>Estimated cost</th><th>Status</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="tenant-empty">Loading tenant usage…</td></tr> : rows.map((row) => <tr key={row.apiKey}>
          <td><span className="tenant-cell"><span className="tenant-avatar">{row.name.slice(0, 1)}</span>{row.name}</span></td>
          <td><code>••••••••{row.apiKey.slice(-4)}</code></td>
          <td>{row.usage ? `${row.usage.quotaUsed.toLocaleString()} / ${row.usage.quotaLimit.toLocaleString()}` : "Unavailable"}</td>
          <td>{row.usage?.requests.toLocaleString() ?? "—"}</td>
          <td>{row.usage ? `$${row.usage.costUsd.toFixed(4)}` : "—"}</td>
          <td>{row.usage ? <span className="tenant-status">Active</span> : <span className="tenant-status unavailable" title={row.error}>Unavailable</span>}</td>
        </tr>)}
      </tbody></table></div>
    </Card>
    <p className="tenant-demo-note">These are public demo credentials for local assessment use. Do not use them in production.</p>
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}
