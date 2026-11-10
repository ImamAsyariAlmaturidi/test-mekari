"use client";

import { useEffect, useState } from "react";

const storageKey = "mini-router-api-key";
const tenantsStorageKey = "mini-router-created-tenants";
const tenantKeyEvent = "mini-router-tenant-key";
const tenantListEvent = "mini-router-tenant-list";
export type TenantOption = { name: string; apiKey: string };
export const demoTenants: TenantOption[] = [
  { name: "Demo Tenant", apiKey: "demo-tenant-key" },
  { name: "Acme Store", apiKey: "acme-demo-key" },
  { name: "Nova Commerce", apiKey: "nova-demo-key" }
];

function readTenants(): TenantOption[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(tenantsStorageKey) ?? "[]") as unknown;
    const created = Array.isArray(saved) ? saved.filter((tenant): tenant is TenantOption =>
      typeof tenant?.name === "string" && typeof tenant?.apiKey === "string"
    ) : [];
    return [...demoTenants, ...created.filter((tenant) => !demoTenants.some((demo) => demo.apiKey === tenant.apiKey))];
  } catch { return [...demoTenants]; }
}

export function useTenants() {
  const [tenants, setTenants] = useState<TenantOption[]>([...demoTenants]);
  useEffect(() => {
    const sync = () => setTenants(readTenants());
    sync();
    window.addEventListener(tenantListEvent, sync);
    return () => window.removeEventListener(tenantListEvent, sync);
  }, []);
  const addTenant = (tenant: TenantOption) => {
    const created = readTenants().filter((item) => !demoTenants.some((demo) => demo.apiKey === item.apiKey));
    const next = [...created.filter((item) => item.apiKey !== tenant.apiKey), tenant];
    sessionStorage.setItem(tenantsStorageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(tenantListEvent));
  };
  return { tenants, addTenant };
}

export function useTenantKey() {
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    const sync = (event?: Event) => setApiKey(event instanceof CustomEvent ? event.detail : sessionStorage.getItem(storageKey) ?? "demo-tenant-key");
    sync();
    window.addEventListener(tenantKeyEvent, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(tenantKeyEvent, sync); window.removeEventListener("storage", sync); };
  }, []);
  const saveApiKey = (value: string) => {
    sessionStorage.setItem(storageKey, value);
    window.dispatchEvent(new CustomEvent(tenantKeyEvent, { detail: value }));
  };
  return { apiKey, setApiKey: saveApiKey };
}
