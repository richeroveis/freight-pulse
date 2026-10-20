import type { ReactNode } from "react";
import type { Band, ShipmentStatus } from "../types";
import { BAND_META } from "../lib/settlement";

const TONE_CLASSES: Record<string, string> = {
  teal: "border-teal/40 bg-teal/10 text-teal",
  amber: "border-amber/40 bg-amber/10 text-amber",
  coral: "border-coral/40 bg-coral/10 text-coral",
  ice: "border-ice/40 bg-ice/10 text-ice",
  mist: "border-rail bg-deck text-mist",
};

const STATUS_TONE: Record<ShipmentStatus, string> = {
  OPEN: "border-ice/30 bg-ice/5 text-ice",
  CARRIER_ACCEPTED: "border-teal/30 bg-teal/5 text-teal",
  MANIFEST_SUBMITTED: "border-amber/30 bg-amber/5 text-amber",
  AUDIT_IN_PROGRESS: "border-amber/50 bg-amber/10 text-amber",
  AUDIT_VERIFIED: "border-ice/50 bg-ice/10 text-ice",
  SETTLED: "border-teal/50 bg-teal/10 text-teal",
  RECLAIMED: "border-rail bg-deck text-mist",
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  OPEN: "OPEN",
  CARRIER_ACCEPTED: "CARRIER LOCKED",
  MANIFEST_SUBMITTED: "MANIFEST IN",
  AUDIT_IN_PROGRESS: "AUDITING",
  AUDIT_VERIFIED: "VERIFIED",
  SETTLED: "SETTLED",
  RECLAIMED: "RECLAIMED",
};

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-rail/60 px-5 py-4">
      <div>
        <p className="label">{eyebrow}</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "ice",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "ice" | "teal" | "amber" | "coral";
}) {
  const toneClass = {
    ice: "text-ice",
    teal: "text-teal",
    amber: "text-amber",
    coral: "text-coral",
  }[tone];
  return (
    <div className="panel scanline p-4">
      <div className="flex items-start justify-between">
        <p className="label">{label}</p>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className={`mono mt-3 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-mist/70">{hint}</p> : null}
    </div>
  );
}

export function BandBadge({ band, compact = false }: { band: Band | ""; compact?: boolean }) {
  const effective = (band || "AWAITING_TELEMETRY") as Band;
  const meta = BAND_META[effective] ?? BAND_META.AWAITING_TELEMETRY;
  return (
    <span className={`chip ${TONE_CLASSES[meta.tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function StatusChip({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`chip ${STATUS_TONE[status] ?? TONE_CLASSES.mist}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Meter({
  value,
  max,
  tone = "ice",
  height = "h-1.5",
}: {
  value: number;
  max: number;
  tone?: "ice" | "teal" | "amber" | "coral";
  height?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    ice: "bg-ice",
    teal: "bg-teal",
    amber: "bg-amber",
    coral: "bg-coral",
  }[tone];
  return (
    <div className={`w-full overflow-hidden rounded-full bg-rail/60 ${height}`}>
      <div className={`${height} rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-rail/50 bg-deck/40 px-3 py-2">
      <p className="label">{label}</p>
      <p className="mono mt-1 break-words text-[10px] leading-4 text-white/90" title={typeof value === "string" ? value : undefined}>
        {value}
      </p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-rail/70 bg-deck/30 p-6 text-center text-xs text-mist/70">
      {message}
    </div>
  );
}
