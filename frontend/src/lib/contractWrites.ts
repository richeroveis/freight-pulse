import { sendWrite, type WriteResult } from "./genlayer";
import type { WalletSession } from "./wallet";

export const FPT_UNIT = 10 ** 6;

// Client-side mirrors of the contract floors and ceilings in
// contracts/freight_pulse.py. They exist to give immediate feedback; the
// contract remains the final authority and re-checks every value.
export const LIMITS = {
  bolMin: 4,
  bolMax: 64,
  routeMin: 3,
  routeMax: 120,
  tempMinC: -90,
  tempMaxC: 60,
  transitMinHours: 1,
  transitMaxHours: 8760,
  deadlineMinSeconds: 180,
  deadlineMaxSeconds: 180 * 24 * 60 * 60,
  amountMaxWholeFpt: 1_000_000_000_000,
  bpsMax: 10_000,
} as const;

// create_shipment_order receives whole degrees Celsius and whole hours. The
// contract scales them to hundredths of a degree and to minutes internally, so
// the UI must not pre-scale, or the stored ceiling would be wrong.
export interface CreateOrderInput {
  billOfLadingId: string;
  route: string;
  tempC: number;
  transitHours: number;
  freightFeeWholeFpt: number;
  carrierBondWholeFpt: number;
  deadlineLeadSeconds: number;
}

export function validateCreateOrder(input: CreateOrderInput): string[] {
  const errors: string[] = [];
  const bol = input.billOfLadingId.trim();
  if (bol.length < LIMITS.bolMin || bol.length > LIMITS.bolMax) {
    errors.push(`Bill of lading must be ${LIMITS.bolMin} to ${LIMITS.bolMax} characters.`);
  } else if (!/^[A-Za-z0-9._-]+$/.test(bol)) {
    errors.push("Bill of lading may only use letters, digits, dot, underscore and hyphen.");
  }
  const route = input.route.trim();
  if (route.length < LIMITS.routeMin || route.length > LIMITS.routeMax) {
    errors.push(`Route must be ${LIMITS.routeMin} to ${LIMITS.routeMax} characters.`);
  }
  if (!Number.isInteger(input.tempC) || input.tempC < LIMITS.tempMinC || input.tempC > LIMITS.tempMaxC) {
    errors.push(`Temperature ceiling must be a whole number between ${LIMITS.tempMinC} and ${LIMITS.tempMaxC} C.`);
  }
  if (
    !Number.isInteger(input.transitHours) ||
    input.transitHours < LIMITS.transitMinHours ||
    input.transitHours > LIMITS.transitMaxHours
  ) {
    errors.push(`Transit SLA must be a whole number between ${LIMITS.transitMinHours} and ${LIMITS.transitMaxHours} hours.`);
  }
  if (!isBoundedAmount(input.freightFeeWholeFpt)) {
    errors.push(`Freight fee must be a positive whole FPT amount up to ${LIMITS.amountMaxWholeFpt.toLocaleString()}.`);
  }
  if (!isBoundedAmount(input.carrierBondWholeFpt)) {
    errors.push(`Carrier bond must be a positive whole FPT amount up to ${LIMITS.amountMaxWholeFpt.toLocaleString()}.`);
  }
  if (
    !Number.isInteger(input.deadlineLeadSeconds) ||
    input.deadlineLeadSeconds < LIMITS.deadlineMinSeconds ||
    input.deadlineLeadSeconds > LIMITS.deadlineMaxSeconds
  ) {
    errors.push(
      `Delivery deadline must be between ${LIMITS.deadlineMinSeconds} seconds and ${Math.round(LIMITS.deadlineMaxSeconds / 86400)} days from now.`,
    );
  }
  return errors;
}

function isBoundedAmount(wholeFpt: number): boolean {
  return (
    Number.isInteger(wholeFpt) &&
    wholeFpt > 0 &&
    wholeFpt <= LIMITS.amountMaxWholeFpt
  );
}

// Mirrors _validate_manifest_url. The client is deliberately stricter than the
// contract by rejecting every IP literal host, not only the private ranges.
export function validateManifestUrl(raw: string): string | null {
  const text = raw.trim();
  if (text.length < 12) return "Manifest URL is too short.";
  if (text.length > 300) return "Manifest URL is too long.";
  if (!text.startsWith("https://")) return "Manifest URL must use https.";
  for (const bad of [" ", "\t", "\n", "\r", "\\", "`"]) {
    if (text.includes(bad)) return "Manifest URL contains forbidden characters.";
  }
  const remainder = text.slice("https://".length);
  const hostPort = remainder.split("/")[0].split("?")[0];
  if (hostPort.includes("@")) return "Manifest URL must not embed credentials.";
  if (hostPort.includes(":")) return "Manifest URL must not carry a port.";
  const host = hostPort.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".")) return "Manifest URL host must be a public domain.";
  if (isIpLiteral(host)) return "Manifest URL must not use an IP literal host.";
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "169.254.169.254"];
  if (blockedHosts.includes(host)) return "Manifest URL host is private.";
  for (const suffix of [".local", ".internal", ".localhost", ".home", ".lan"]) {
    if (host.endsWith(suffix)) return "Manifest URL host is private.";
  }
  const privatePrefixes = [
    "10.", "127.", "192.168.", "169.254.",
    ...range(16, 31).map((n) => `172.${n}.`),
  ];
  for (const prefix of privatePrefixes) {
    if (host.startsWith(prefix)) return "Manifest URL host is private.";
  }
  return null;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to; value += 1) out.push(value);
  return out;
}

function isIpLiteral(host: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  return host.includes(":") || /^\[.*\]$/.test(host);
}

export function validateBps(bps: number): string | null {
  if (!Number.isInteger(bps) || bps < 0 || bps > LIMITS.bpsMax) {
    return `Carrier payout bps must be a whole number between 0 and ${LIMITS.bpsMax}.`;
  }
  return null;
}

function wholeFptToBase(whole: number): number {
  return Math.round(whole * FPT_UNIT);
}

// Every helper below calls the real contract method through writeContract and
// waits for the receipt, so the on-chain state is the source of truth.
export function createShipmentOrder(
  session: WalletSession,
  input: CreateOrderInput,
  chainNow: number,
): Promise<WriteResult> {
  const deadline = Math.floor(chainNow) + input.deadlineLeadSeconds;
  return sendWrite(session, "create_shipment_order", [
    input.billOfLadingId.trim(),
    input.route.trim(),
    input.tempC,
    input.transitHours,
    wholeFptToBase(input.freightFeeWholeFpt),
    wholeFptToBase(input.carrierBondWholeFpt),
    deadline,
  ]);
}

export function acceptShipmentBid(session: WalletSession, shipmentId: number): Promise<WriteResult> {
  return sendWrite(session, "accept_shipment_bid", [shipmentId]);
}

export function submitDeliveryManifest(
  session: WalletSession,
  shipmentId: number,
  url: string,
): Promise<WriteResult> {
  return sendWrite(session, "submit_delivery_manifest", [shipmentId, url.trim()]);
}

export function auditShipmentFulfilmentLive(
  session: WalletSession,
  shipmentId: number,
): Promise<WriteResult> {
  return sendWrite(session, "audit_shipment_fulfilment_live", [shipmentId]);
}

export function claimShipmentSettlement(
  session: WalletSession,
  shipmentId: number,
): Promise<WriteResult> {
  return sendWrite(session, "claim_shipment_settlement", [shipmentId]);
}

export function proposeMutualRelease(
  session: WalletSession,
  shipmentId: number,
  carrierPayoutBps: number,
): Promise<WriteResult> {
  return sendWrite(session, "propose_mutual_release", [shipmentId, carrierPayoutBps]);
}

export function reclaimExpiredShipment(
  session: WalletSession,
  shipmentId: number,
): Promise<WriteResult> {
  return sendWrite(session, "reclaim_expired_shipment", [shipmentId]);
}

export function transferTokens(
  session: WalletSession,
  to: string,
  wholeFpt: number,
): Promise<WriteResult> {
  return sendWrite(session, "transfer_tokens", [to.trim(), wholeFptToBase(wholeFpt)]);
}
