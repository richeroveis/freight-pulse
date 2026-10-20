export type Band =
  | "FULL_ON_TIME_RELEASE"
  | "LATE_TRANSIT_PENALTY"
  | "COLD_CHAIN_SPOILAGE_SLASH"
  | "MUTUAL_RELEASE_CO_SIGNED"
  | "EXPIRED_RECLAIM"
  | "AWAITING_TELEMETRY";

export type ShipmentStatus =
  | "OPEN"
  | "CARRIER_ACCEPTED"
  | "MANIFEST_SUBMITTED"
  | "AUDIT_IN_PROGRESS"
  | "AUDIT_VERIFIED"
  | "SETTLED"
  | "RECLAIMED";

export interface Shipment {
  shipment_id: number;
  bill_of_lading_id: string;
  route: string;
  shipper: string;
  carrier: string;
  carrier_assigned: boolean;
  max_temp_celsius: string | number;
  max_temp_c_x100: number;
  max_transit_hours: string | number;
  max_transit_minutes: number;
  freight_fee: number;
  required_carrier_bond: number;
  delivery_deadline_clock: number;
  created_at: number;
  status: ShipmentStatus;
  telemetry_manifest_url: string;
  accepted_at: number;
  manifest_submitted_at: number;
  audited_at: number;
  settled_at: number;
  fulfilment_band: Band | "";
  invariant_band: Band;
  customs_cleared: boolean;
  temp_breached: boolean;
  transit_over: boolean;
  recorded_temp_celsius: string | number;
  recorded_temp_c_x100: number;
  recorded_transit_hours: string | number;
  recorded_transit_minutes: number;
  carrier_payout: number;
  shipper_refund: number;
  bond_refund: number;
  slash_amount: number;
  carrier_fee_bps: number;
  audit_note: string;
  evidence_excerpt: string;
  mutual_release_bps: number;
  shipper_approved: boolean;
  carrier_approved: boolean;
  shipper_bps: number;
  carrier_bps: number;
  escrowed: number;
  invariant_conservation_ok: boolean;
}

export interface VaultInvariants {
  vault_custody_balance: number;
  locked_escrow: number;
  vault_matches_escrow: boolean;
  sum_token_balances: number;
  total_supply: number;
  supply_matches_balances_plus_vault: boolean;
  settled_conservation_ok: boolean;
  shipment_count: number;
  conserved: boolean;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: number;
  vault_custody_balance: number;
}

export interface DashboardData {
  shipments: Shipment[];
  invariants: VaultInvariants;
  metadata: TokenMetadata;
  chainTime: number;
  source: "live" | "snapshot";
}

export interface SettlementInput {
  telemetryPresent: boolean;
  customsCleared: boolean;
  recordedTempCX100: number;
  maxTempCX100: number;
  recordedTransitMinutes: number;
  maxTransitMinutes: number;
  freightFee: number;
  carrierBond: number;
}

export interface SettlementSplit {
  fulfilmentBand: Band;
  telemetryPresent: boolean;
  customsCleared: boolean;
  tempBreached: boolean;
  transitOver: boolean;
  carrierFeeBps: number;
  carrierPayout: number;
  shipperRefund: number;
  bondRefund: number;
  slashAmount: number;
  escrowed: number;
  conservationOk: boolean;
  settleable: boolean;
}

export type ProbeId =
  | "unilateral-release"
  | "premature-reclaim"
  | "untrusted-url";
