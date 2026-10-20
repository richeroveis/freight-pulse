import { FPT_DECIMALS } from "../config";

const fptFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatFpt(baseUnits: number, compact = false): string {
  const whole = baseUnits / 10 ** FPT_DECIMALS;
  if (compact && whole >= 10_000) return `${compactFormatter.format(whole)} FPT`;
  return `${fptFormatter.format(Math.round(whole))} FPT`;
}

export function formatFptNumber(baseUnits: number): number {
  return Math.round(baseUnits / 10 ** FPT_DECIMALS);
}

export function formatTemp(cX100: number): string {
  const sign = cX100 < 0 ? "-" : "";
  const magnitude = Math.abs(Math.round(cX100));
  return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, "0")} C`;
}

export function formatHours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const fraction = Math.round(((minutes % 60) * 100) / 60);
  return `${whole}.${String(fraction).padStart(2, "0")} h`;
}

export function shortAddress(address: string, size = 4): string {
  if (!address || address.length < 12) return address || "-";
  return `${address.slice(0, 2 + size)}...${address.slice(-size)}`;
}

export function shortHash(hash: string, size = 6): string {
  if (!hash) return "";
  return `${hash.slice(0, 2 + size)}...${hash.slice(-size)}`;
}

export function formatClock(unixSeconds: number): string {
  if (!unixSeconds) return "-";
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16);
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "expired";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}
