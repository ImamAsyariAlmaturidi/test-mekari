import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = { title: "Mini Inference Router", description: "Customer support AI gateway" };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="id"><body><AppShell>{children}</AppShell><Toaster position="bottom-right" richColors /></body></html>; }
