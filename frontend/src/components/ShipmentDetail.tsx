import {
  ArrowUpRight,
  Clock3,
  FileText,
  Gauge,
  ShieldCheck,
  Sparkles,
  ThermometerSnowflake,
  WalletCards,
} from "lucide-react";
import type { Shipment } from "../types";
import { AUDIT_TX_BY_SHIPMENT, CLAIM_TX_BY_SHIPMENT } from "../data/evidence";
import { EXPLORER_URL } from "../config";
import { formatClock, formatCountdown, formatFpt, formatHours, formatTemp, shortAddress, shortHash } from "../lib/format";
import { displayBand, splitFromShipment } from "../lib/settlement";
import { BandBadge, KeyValue, Meter, StatusChip } from "./ui";
import { RouteMap } from "./RouteMap";
import { ThermalGauge } from "./ThermalGauge";

const LIFECYCLE = ["OPEN", "CARRIER_ACCEPTED", "MANIFEST_SUBMITTED", "AUDIT_VERIFIED", "SETTLED"];

function lifecycleIndex(shipment: Shipment): number {
  if (shipment.status === "RECLAIMED") return 4;
  const index = LIFECYCLE.indexOf(shipment.status);
  return index < 0 ? 0 : index;
}

export function ShipmentDetail({
  shipment,
  shipments,
  chainTime,
  onOpenConsensus,
  onSimulate,
}: {
  shipment: Shipment;
  shipments: Shipment[];
  chainTime: number;
  onOpenConsensus: () => void;
  onSimulate: () => void;
}) {
  const split = splitFromShipment(shipment);
  const settled = shipment.status === "SETTLED" || shipment.status === "RECLAIMED";
  const carrierPayout = settled ? shipment.carrier_payout : split.carrierPayout;
  const shipperRefund = settled ? shipment.shipper_refund : split.shipperRefund;
  const total = Math.max(1, shipment.freight_fee + shipment.required_carrier_bond);
  const carrierPct = (carrierPayout / total) * 100;
  const shipperPct = (shipperRefund / total) * 100;
  const stage = lifecycleIndex(shipment);
  const deadlineDelta = shipment.delivery_deadline_clock - chainTime;
  const auditHash = AUDIT_TX_BY_SHIPMENT[shipment.shipment_id];
  const claimHash = CLAIM_TX_BY_SHIPMENT[shipment.shipment_id];

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rail/60 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="label">Shipment #{shipment.shipment_id}</p>
            <StatusChip status={shipment.status} />
          </div>
          <h2 className="mono mt-1.5 text-sm font-semibold tracking-tight text-white">
            {shipment.bill_of_lading_id}
          </h2>
          <p className="mt-1 text-[11px] text-mist/70">{shipment.route}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BandBadge band={displayBand(shipment)} />
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onOpenConsensus}>
              <FileText size={13} /> Consensus
            </button>
            <button type="button" className="btn-primary" onClick={onSimulate}>
              <Gauge size={13} /> What-if
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <RouteMap shipment={shipment} shipments={shipments} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KeyValue label="Freight fee" value={formatFpt(shipment.freight_fee)} />
            <KeyValue label="Carrier bond" value={formatFpt(shipment.required_carrier_bond)} />
            <KeyValue label="Transit SLA" value={formatHours(shipment.max_transit_minutes)} />
            <KeyValue label="Deadline" value={formatClock(shipment.delivery_deadline_clock)} />
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <div className="flex items-center justify-between">
              <p className="label">Escrow distribution</p>
              <span className="mono text-[10px] text-mist/70">
                {formatFpt(shipment.freight_fee + shipment.required_carrier_bond)} locked envelope
              </span>
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-rail/60">
              <div
                className="h-full bg-teal transition-all duration-500"
                style={{ width: `${carrierPct}%` }}
                title="Carrier payout"
              />
              <div
                className="h-full bg-ice transition-all duration-500"
                style={{ width: `${shipperPct}%` }}
                title="Shipper refund"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-teal/30 bg-teal/5 px-3 py-2">
                <p className="label text-teal/80">Carrier payout</p>
                <p className="mono mt-1 text-sm font-semibold text-teal">{formatFpt(carrierPayout)}</p>
              </div>
              <div className="rounded-lg border border-ice/30 bg-ice/5 px-3 py-2">
                <p className="label text-ice/80">Shipper refund</p>
                <p className="mono mt-1 text-sm font-semibold text-ice">{formatFpt(shipperRefund)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-mist/70">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={11} className="text-teal" /> carrier {shortAddress(shipment.carrier)}
              </span>
              <span className="mono">
                slash {formatFpt(settled ? shipment.slash_amount : split.slashAmount, true)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <div className="flex items-center justify-between">
              <p className="label">Lifecycle</p>
              {shipment.delivery_deadline_clock > 0 && !settled ? (
                <span className="mono flex items-center gap-1 text-[10px] text-amber">
                  <Clock3 size={11} /> {formatCountdown(deadlineDelta)}
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex items-center">
              {LIFECYCLE.map((step, index) => {
                const done = index <= stage;
                return (
                  <div key={step} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <span
                        className={`h-2.5 w-2.5 rounded-full border ${
                          done ? "border-teal bg-teal" : "border-rail bg-abyss"
                        }`}
                      />
                      <span
                        className={`mt-1.5 hidden text-[8px] uppercase tracking-[0.1em] sm:block ${
                          done ? "text-teal/90" : "text-mist/40"
                        }`}
                      >
                        {step.replace("_", " ").toLowerCase()}
                      </span>
                    </div>
                    {index < LIFECYCLE.length - 1 ? (
                      <span className={`mx-1 h-px flex-1 ${index < stage ? "bg-teal/60" : "bg-rail"}`} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <div className="flex items-center justify-between">
              <p className="label">Cold-chain telemetry</p>
              <ThermometerSnowflake size={14} className={shipment.temp_breached ? "text-coral" : "text-ice"} />
            </div>
            <div className="mt-2">
              <ThermalGauge
                recordedCX100={shipment.recorded_temp_c_x100}
                ceilingCX100={shipment.max_temp_c_x100}
                breached={shipment.temp_breached}
              />
            </div>
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <div className="flex items-center justify-between">
              <p className="label">Manifest evidence</p>
              {shipment.telemetry_manifest_url ? (
                <a
                  href={shipment.telemetry_manifest_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mono flex items-center gap-1 text-[10px] text-ice hover:text-white"
                >
                  open <ArrowUpRight size={11} />
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-mist/80">
              {shipment.evidence_excerpt || "No consensus telemetry recorded yet. The vault holds the escrow."}
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <div className="flex justify-between text-[9px] text-mist/60">
                  <span>Recorded transit</span>
                  <span className="mono">{formatHours(shipment.recorded_transit_minutes)}</span>
                </div>
                <Meter
                  value={shipment.recorded_transit_minutes}
                  max={Math.max(shipment.max_transit_minutes, shipment.recorded_transit_minutes)}
                  tone={shipment.transit_over ? "amber" : "teal"}
                />
              </div>
              <div>
                <div className="flex justify-between text-[9px] text-mist/60">
                  <span>Temperature headroom</span>
                  <span className="mono">{formatTemp(shipment.recorded_temp_c_x100 - shipment.max_temp_c_x100)}</span>
                </div>
                <Meter
                  value={Math.max(0, shipment.max_temp_c_x100 - shipment.recorded_temp_c_x100)}
                  max={Math.max(1, shipment.max_temp_c_x100)}
                  tone={shipment.temp_breached ? "coral" : "ice"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <p className="label">Audit trail</p>
            <div className="mt-2 space-y-2 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-mist/70">
                  <Sparkles size={11} className="text-ice" /> live audit
                </span>
                {auditHash ? (
                  <a
                    href={`${EXPLORER_URL}/transactions/${auditHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-ice hover:text-white"
                  >
                    {shortHash(auditHash)}
                  </a>
                ) : (
                  <span className="mono text-mist/40">pending</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-mist/70">
                  <WalletCards size={11} className="text-teal" /> claim
                </span>
                {claimHash ? (
                  <a
                    href={`${EXPLORER_URL}/transactions/${claimHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-ice hover:text-white"
                  >
                    {shortHash(claimHash)}
                  </a>
                ) : (
                  <span className="mono text-mist/40">pending</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mist/70">audit note</span>
                <span className="max-w-[60%] truncate text-right text-mist/50">
                  {shipment.audit_note || "not audited"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
