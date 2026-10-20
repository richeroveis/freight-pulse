import type { Band, SettlementInput, SettlementSplit } from "../types";

export const BPS_DENOMINATOR = 10_000;
export const LATE_CARRIER_BPS = 7_000;

export const BAND_META: Record<
  Band,
  { label: string; short: string; tone: "teal" | "amber" | "coral" | "ice" | "mist"; blurb: string }
> = {
  FULL_ON_TIME_RELEASE: {
    label: "Full on-time release",
    short: "FULL RELEASE",
    tone: "teal",
    blurb: "Customs cleared, cold chain intact, transit inside SLA. Carrier takes fee plus bond.",
  },
  LATE_TRANSIT_PENALTY: {
    label: "Late transit penalty",
    short: "LATE PENALTY",
    tone: "amber",
    blurb: "Cold chain intact but the SLA was missed. Carrier keeps 70 percent of the fee.",
  },
  COLD_CHAIN_SPOILAGE_SLASH: {
    label: "Cold-chain spoilage slash",
    short: "SPOILAGE SLASH",
    tone: "coral",
    blurb: "Temperature breach or customs rejection. Fee and bond return to the shipper.",
  },
  MUTUAL_RELEASE_CO_SIGNED: {
    label: "Mutual release co-signed",
    short: "MUTUAL RELEASE",
    tone: "ice",
    blurb: "Shipper and carrier signed the same split. Neither party can settle alone.",
  },
  EXPIRED_RECLAIM: {
    label: "Expired reclaim",
    short: "RECLAIMED",
    tone: "mist",
    blurb: "Deadline passed with no timely manifest. Shipper recovered the escrowed funds.",
  },
  AWAITING_TELEMETRY: {
    label: "Awaiting telemetry",
    short: "PENDING",
    tone: "mist",
    blurb: "No consensus telemetry yet. The vault holds the escrow and no split is final.",
  },
};

export function computeFulfilmentSplit(input: SettlementInput): SettlementSplit {
  const fee = Math.max(0, Math.round(input.freightFee));
  const bond = Math.max(0, Math.round(input.carrierBond));

  if (!input.telemetryPresent) {
    return {
      fulfilmentBand: "AWAITING_TELEMETRY",
      telemetryPresent: false,
      customsCleared: false,
      tempBreached: false,
      transitOver: false,
      carrierFeeBps: 0,
      carrierPayout: 0,
      shipperRefund: 0,
      bondRefund: 0,
      slashAmount: 0,
      escrowed: fee + bond,
      conservationOk: true,
      settleable: false,
    };
  }

  const tempBreached = input.recordedTempCX100 > input.maxTempCX100;
  const transitOver = input.recordedTransitMinutes > input.maxTransitMinutes;
  let band: Band;
  let carrierFeeBps: number;
  let carrierFee: number;
  let shipperRefund: number;
  let bondRefund: number;
  let slashAmount: number;

  if (!input.customsCleared || tempBreached) {
    band = "COLD_CHAIN_SPOILAGE_SLASH";
    carrierFeeBps = 0;
    carrierFee = 0;
    shipperRefund = fee + bond;
    bondRefund = 0;
    slashAmount = fee + bond;
  } else if (transitOver) {
    band = "LATE_TRANSIT_PENALTY";
    carrierFeeBps = LATE_CARRIER_BPS;
    carrierFee = Math.floor((fee * LATE_CARRIER_BPS) / BPS_DENOMINATOR);
    shipperRefund = fee - carrierFee;
    bondRefund = bond;
    slashAmount = shipperRefund;
  } else {
    band = "FULL_ON_TIME_RELEASE";
    carrierFeeBps = BPS_DENOMINATOR;
    carrierFee = fee;
    shipperRefund = 0;
    bondRefund = bond;
    slashAmount = 0;
  }

  const carrierPayout = carrierFee + bondRefund;
  return {
    fulfilmentBand: band,
    telemetryPresent: true,
    customsCleared: input.customsCleared,
    tempBreached,
    transitOver,
    carrierFeeBps,
    carrierPayout,
    shipperRefund,
    bondRefund,
    slashAmount,
    escrowed: fee + bond,
    conservationOk: carrierPayout + shipperRefund === fee + bond,
    settleable: true,
  };
}

export function displayBand(shipment: {
  fulfilment_band: Band | "";
  invariant_band: Band;
  status: string;
}): Band {
  if (shipment.fulfilment_band) return shipment.fulfilment_band;
  if (shipment.status === "MANIFEST_SUBMITTED" || shipment.status === "AUDIT_IN_PROGRESS") {
    return "AWAITING_TELEMETRY";
  }
  return shipment.invariant_band;
}

export function splitFromShipment(shipment: {
  freight_fee: number;
  required_carrier_bond: number;
  max_temp_c_x100: number;
  recorded_temp_c_x100: number;
  max_transit_minutes: number;
  recorded_transit_minutes: number;
  customs_cleared: boolean;
  status: string;
}): SettlementSplit {
  const hasTelemetry = [
    "MANIFEST_SUBMITTED",
    "AUDIT_IN_PROGRESS",
    "AUDIT_VERIFIED",
    "SETTLED",
  ].includes(shipment.status);
  return computeFulfilmentSplit({
    telemetryPresent: hasTelemetry,
    customsCleared: shipment.customs_cleared,
    recordedTempCX100: shipment.recorded_temp_c_x100,
    maxTempCX100: shipment.max_temp_c_x100,
    recordedTransitMinutes: shipment.recorded_transit_minutes,
    maxTransitMinutes: shipment.max_transit_minutes,
    freightFee: shipment.freight_fee,
    carrierBond: shipment.required_carrier_bond,
  });
}
