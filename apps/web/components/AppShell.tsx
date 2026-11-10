"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createTenant, getJson } from "../lib/api";
import { useTenantKey, useTenants, type TenantOption } from "../lib/tenant";
import { Icon, type IconName } from "./Icons";

const nav: { href: string; label: string; icon: IconName; description: string }[] = [
  { href: "/", label: "Playground", icon: "play", description: "Test a support request" },
  { href: "/usage", label: "Usage & Analytics", icon: "chart", description: "Tenant operations" },
  { href: "/requests", label: "Request Logs", icon: "logs", description: "Recent inference activity" },
  { href: "/evaluation", label: "Evaluation", icon: "evaluation", description: "Compare retrieval configurations" },
  { href: "/tenants", label: "Tenants", icon: "tenants", description: "Tenant access and quotas" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const [tenant, setTenant] = useState("Tenant"); const [showCreateTenant, setShowCreateTenant] = useState(false); const { apiKey, setApiKey } = useTenantKey(); const { tenants, addTenant } = useTenants();
  useEffect(() => { if (apiKey) getJson<{ tenant: string }>("/v1/usage", apiKey).then((usage) => setTenant(usage.tenant)).catch(() => setTenant("Unauthenticated")); }, [apiKey]);
  const selectedTenant = tenants.find((item) => item.apiKey === apiKey);
  async function onTenantCreated(created: TenantOption) { addTenant(created); setApiKey(created.apiKey); }
  function changeTenant(value: string) {
    if (value === "__create__") setShowCreateTenant(true);
    else { const selected = tenants.find((item) => item.apiKey === value); if (selected) setApiKey(selected.apiKey); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">M</span><span>Mesh<span className="brand-muted">/Router</span></span></Link>
      <nav aria-label="Main navigation"><p className="nav-label">Workspace</p>{nav.map((item) => <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
      <div className="sidebar-tenant-picker"><span className="sidebar-tenant-label">Active tenant</span><div className="sidebar-picker-row"><span className="tenant-avatar" aria-hidden="true">{tenant.slice(0, 1).toUpperCase()}</span><TenantPicker tenants={tenants} selectedKey={selectedTenant?.apiKey ?? "custom"} onChange={changeTenant} /></div><small>{tenant} · API key scoped</small></div>
    </aside>
    <div className="app-content"><main className={pathname === "/" ? "playground-main" : undefined}>{children}</main></div>
    {showCreateTenant ? <CreateTenantDialog close={() => setShowCreateTenant(false)} onCreated={onTenantCreated} /> : null}
  </div>;
}

function TenantPicker({ tenants, selectedKey, onChange }: { tenants: TenantOption[]; selectedKey: string; onChange(value: string): void }) {
  return <select aria-label="Select tenant" value={selectedKey} onChange={(event) => onChange(event.target.value)}><option value="custom" disabled>Custom API key</option>{tenants.map((item) => <option key={item.apiKey} value={item.apiKey}>{item.name}</option>)}<option value="__create__">Create tenant…</option></select>;
}

function CreateTenantDialog({ close, onCreated }: { close(): void; onCreated(tenant: TenantOption): void }) {
  const [name, setName] = useState("");
  const [quota, setQuota] = useState("1000");
  const [adminKey, setAdminKey] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const created = await createTenant(name, Number(quota), adminKey);
      onCreated({ name: created.tenant.name, apiKey: created.apiKey });
      setCreatedKey(created.apiKey); setAdminKey("");
      toast.success("Tenant created");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create tenant"); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="tenant-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-tenant-title">
      <div className="panel-heading"><div><p className="section-kicker">Tenant access</p><h2 id="create-tenant-title">{createdKey ? "Tenant created" : "Create tenant"}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close">×</button></div>
      {createdKey ? <div className="create-tenant-success"><p>Copy this API key now. It is stored only in this browser session and cannot be retrieved from the server later.</p><code>{createdKey}</code><button type="button" className="primary-button" onClick={() => { void navigator.clipboard.writeText(createdKey).then(() => toast.success("API key copied")).catch(() => toast.error("Could not copy API key")); }}>Copy API key</button><button type="button" className="secondary-button" onClick={close}>Done</button></div> : <form className="tenant-create-form" onSubmit={submit}>
        <label>Tenant name<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Request quota<input type="number" required min={1} max={1_000_000} value={quota} onChange={(event) => setQuota(event.target.value)} /></label>
        <label>Tenant admin key<input type="password" required minLength={24} autoComplete="off" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} /></label>
        <p className="create-tenant-hint">Set <code>TENANT_ADMIN_KEY</code> in the API environment. This admin key is sent only for this creation request.</p>
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
        <div className="tenant-create-actions"><button className="secondary-button" type="button" onClick={close}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create tenant"}</button></div>
      </form>}
    </section>
  </div>;
}
