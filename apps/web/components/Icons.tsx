import {
  Activity, ChartNoAxesColumnIncreasing, ChevronRight, Copy, KeyRound, Play, Building2,
  RefreshCw, Send, ScrollText, Trash2, FlaskConical, type LucideIcon
} from "lucide-react";
import type { SVGProps } from "react";

export type IconName = "play" | "chart" | "logs" | "tenants" | "evaluation" | "key" | "pulse" | "refresh" | "send" | "trash" | "chevron" | "copy";
const icons: Record<IconName, LucideIcon> = {
  play: Play, chart: ChartNoAxesColumnIncreasing, logs: ScrollText, tenants: Building2, evaluation: FlaskConical, key: KeyRound,
  pulse: Activity, refresh: RefreshCw, send: Send, trash: Trash2, chevron: ChevronRight, copy: Copy
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const Component = icons[name];
  return <Component aria-hidden="true" strokeWidth={1.8} {...props} />;
}
