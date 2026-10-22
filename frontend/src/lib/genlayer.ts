import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "../config";
import type {
  Band,
  DashboardData,
  Shipment,
  SettlementInput,
  SettlementSplit,
  TokenMetadata,
  VaultInvariants,
} from "../types";
import { computeFulfilmentSplit } from "./settlement";
import { publicClient, type WalletSession, walletClient } from "./wallet";

export function toNum(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function toStr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = message.includes("429") || message.toLowerCase().includes("rate");
      await sleep(rateLimited ? 1200 * (attempt + 1) : 350 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function normalizeShipment(raw: Record<string, unknown>): Shipment {
  return {
    shipment_id: toNum(raw.shipment_id),
    bill_of_lading_id: toStr(raw.bill_of_lading_id),
    route: toStr(raw.route),
    shipper: toStr(raw.shipper),
    carrier: toStr(raw.carrier),
    carrier_assigned: toBool(raw.carrier_assigned),
    max_temp_celsius: String(raw.max_temp_celsius ?? "0.00"),
    max_temp_c_x100: toNum(raw.max_temp_c_x100),
    max_transit_hours: String(raw.max_transit_hours ?? "0.00"),
    max_transit_minutes: toNum(raw.max_transit_minutes),
    freight_fee: toNum(raw.freight_fee),
    required_carrier_bond: toNum(raw.required_carrier_bond),
    delivery_deadline_clock: toNum(raw.delivery_deadline_clock),
    created_at: toNum(raw.created_at),
    status: toStr(raw.status, "OPEN") as Shipment["status"],
    telemetry_manifest_url: toStr(raw.telemetry_manifest_url),
    accepted_at: toNum(raw.accepted_at),
    manifest_submitted_at: toNum(raw.manifest_submitted_at),
    audited_at: toNum(raw.audited_at),
    settled_at: toNum(raw.settled_at),
    fulfilment_band: (toStr(raw.fulfilment_band) || "") as Band | "",
    invariant_band: toStr(raw.invariant_band, "AWAITING_TELEMETRY") as Band,
    customs_cleared: toBool(raw.customs_cleared),
    temp_breached: toBool(raw.temp_breached),
    transit_over: toBool(raw.transit_over),
    recorded_temp_celsius: String(raw.recorded_temp_celsius ?? "0.00"),
    recorded_temp_c_x100: toNum(raw.recorded_temp_c_x100),
    recorded_transit_hours: String(raw.recorded_transit_hours ?? "0.00"),
    recorded_transit_minutes: toNum(raw.recorded_transit_minutes),
    carrier_payout: toNum(raw.carrier_payout),
    shipper_refund: toNum(raw.shipper_refund),
    bond_refund: toNum(raw.bond_refund),
    slash_amount: toNum(raw.slash_amount),
    carrier_fee_bps: toNum(raw.carrier_fee_bps),
    audit_note: toStr(raw.audit_note),
    evidence_excerpt: toStr(raw.evidence_excerpt),
    mutual_release_bps: toNum(raw.mutual_release_bps),
    shipper_approved: toBool(raw.shipper_approved),
    carrier_approved: toBool(raw.carrier_approved),
    shipper_bps: toNum(raw.shipper_bps),
    carrier_bps: toNum(raw.carrier_bps),
    escrowed: toNum(raw.escrowed),
    invariant_conservation_ok: toBool(raw.invariant_conservation_ok),
  };
}

export function normalizeInvariants(raw: Record<string, unknown>): VaultInvariants {
  return {
    vault_custody_balance: toNum(raw.vault_custody_balance),
    locked_escrow: toNum(raw.locked_escrow),
    vault_matches_escrow: toBool(raw.vault_matches_escrow),
    sum_token_balances: toNum(raw.sum_token_balances),
    total_supply: toNum(raw.total_supply),
    supply_matches_balances_plus_vault: toBool(raw.supply_matches_balances_plus_vault),
    settled_conservation_ok: toBool(raw.settled_conservation_ok),
    shipment_count: toNum(raw.shipment_count),
    conserved: toBool(raw.conserved),
  };
}

export function normalizeMetadata(raw: Record<string, unknown>): TokenMetadata {
  return {
    name: toStr(raw.name, "FreightPulse Token"),
    symbol: toStr(raw.symbol, "FPT"),
    decimals: toNum(raw.decimals) || 6,
    total_supply: toNum(raw.total_supply),
    vault_custody_balance: toNum(raw.vault_custody_balance),
  };
}

export async function loadDashboard(): Promise<DashboardData> {
  const client = publicClient();
  const address = CONTRACT_ADDRESS;

  // Exactly four RPC reads on first paint. No ABI override is passed.
  const shipmentsRaw = await withRetry(() =>
    client.readContract({ address, functionName: "list_shipments", args: [] }),
  );
  await sleep(120);
  const invariantsRaw = await withRetry(() =>
    client.readContract({ address, functionName: "check_vault_invariants", args: [] }),
  );
  await sleep(120);
  const metadataRaw = await withRetry(() =>
    client.readContract({ address, functionName: "get_token_metadata", args: [] }),
  );
  await sleep(120);
  const chainTimeRaw = await withRetry(() =>
    client.readContract({ address, functionName: "get_chain_clock", args: [] }),
  );

  const shipments = Array.isArray(shipmentsRaw)
    ? (shipmentsRaw as Record<string, unknown>[]).map(normalizeShipment)
    : [];
  return {
    shipments,
    invariants: normalizeInvariants((invariantsRaw ?? {}) as Record<string, unknown>),
    metadata: normalizeMetadata((metadataRaw ?? {}) as Record<string, unknown>),
    chainTime: toNum(chainTimeRaw),
    source: "live",
  };
}

export async function readFptBalance(address: string): Promise<number> {
  const client = publicClient();
  const raw = await withRetry(() =>
    client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_token_balance",
      args: [address],
    }),
  );
  return toNum(raw);
}

export async function simulateOnChain(input: SettlementInput): Promise<SettlementSplit> {
  const client = publicClient();
  const raw = (await withRetry(() =>
    client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "simulate_settlement_split",
      args: [
        Math.round(input.freightFee),
        Math.round(input.carrierBond),
        Math.round(input.maxTempCX100),
        Math.round(input.recordedTempCX100),
        Math.round(input.maxTransitMinutes),
        Math.round(input.recordedTransitMinutes),
        input.customsCleared,
      ],
    }),
  )) as Record<string, unknown>;

  const local = computeFulfilmentSplit(input);
  if (!raw || Object.keys(raw).length === 0) return local;
  return {
    ...local,
    fulfilmentBand: toStr(raw.fulfilment_band, local.fulfilmentBand) as Band,
    carrierFeeBps: toNum(raw.carrier_fee_bps),
    carrierPayout: toNum(raw.carrier_payout),
    shipperRefund: toNum(raw.shipper_refund),
    bondRefund: toNum(raw.bond_refund),
    slashAmount: toNum(raw.slash_amount),
    conservationOk: toBool(raw.conservation_ok),
  };
}

export interface WriteResult {
  hash: string;
  accepted: boolean;
  status: string;
  finalized: boolean;
  executionError: string | null;
  raw: Record<string, unknown> | null;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return String(value ?? "");
  }
}

function statusNameOf(receipt: Record<string, unknown>): string {
  const named = receipt.statusName ?? receipt.status_name;
  if (typeof named === "string" && named) return named;
  // The simplified studio receipt exposes status as a number where 7 is FINALIZED.
  if (Number(receipt.status) === 7) return "FINALIZED";
  return String(receipt.status ?? "");
}

// On studionet a contract revert finalizes with consensus MAJORITY_AGREE, so the
// authoritative signal is the leader receipt: execution_result "ERROR" with the
// prefixed reason in result.payload. A non-studio receipt instead exposes
// txExecutionResultName directly.
function readLeader(receipt: Record<string, unknown>): Record<string, unknown> | null {
  const consensus = receipt.consensus_data as Record<string, unknown> | undefined;
  const leader = consensus?.leader_receipt;
  if (Array.isArray(leader)) return (leader[0] as Record<string, unknown>) ?? null;
  if (leader && typeof leader === "object") return leader as Record<string, unknown>;
  return null;
}

function extractRevertReason(receipt: Record<string, unknown>): string | null {
  const executionName = String(
    receipt.txExecutionResultName ?? receipt.tx_execution_result_name ?? "",
  );
  const leader = readLeader(receipt);
  const leaderResult = (leader?.result ?? {}) as Record<string, unknown>;
  const leaderStatus = String(leaderResult.status ?? "").toLowerCase();
  const errored =
    executionName === "FINISHED_WITH_ERROR" ||
    leader?.execution_result === "ERROR" ||
    leaderStatus === "rollback" ||
    leaderStatus === "error";
  if (!errored) return null;
  const payload = leaderResult.payload ?? leaderResult.error ?? receipt.txExecutionError ?? receipt.error;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const marker = /\[(?:EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\][^"\\}]*/.exec(safeJson(leader ?? receipt));
  if (marker) return marker[0].trim();
  return "Contract execution reverted";
}

export async function sendWrite(
  session: WalletSession,
  functionName: string,
  args: Array<string | number | boolean>,
): Promise<WriteResult> {
  const client = walletClient(session);
  const hash = await client.writeContract({
    account: session.kind === "burner" ? session.account : undefined,
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  });
  const receipt = (await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 120,
    interval: 3000,
  })) as unknown as Record<string, unknown>;

  // The simplified receipt can omit the leader detail, so read the full
  // transaction once for the authoritative status and revert payload.
  let detail: Record<string, unknown> = receipt;
  try {
    detail = (await client.getTransaction({ hash })) as unknown as Record<string, unknown>;
  } catch {
    detail = receipt;
  }

  const status = statusNameOf(detail);
  const finalized = status === "FINALIZED";
  const executionError = extractRevertReason(detail);

  return {
    hash: String(hash),
    accepted: finalized && !executionError,
    status: status || "UNKNOWN",
    finalized,
    executionError,
    raw: detail,
  };
}
