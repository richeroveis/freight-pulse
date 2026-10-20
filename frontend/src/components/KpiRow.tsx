import { Anchor, Boxes, ShieldCheck, Snowflake } from "lucide-react";
import type { DashboardData } from "../types";
import { formatFpt } from "../lib/format";
import { Stat } from "./ui";

export function KpiRow({ data }: { data: DashboardData }) {
  const settled = data.shipments.filter((shipment) => shipment.status === "SETTLED");
  const settledVolume = settled.reduce(
    (total, shipment) => total + shipment.carrier_payout + shipment.shipper_refund,
    0,
  );
  const riskCount = data.shipments.filter(
    (shipment) => shipment.temp_breached || shipment.fulfilment_band === "COLD_CHAIN_SPOILAGE_SLASH",
  ).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Vault custody"
        value={formatFpt(data.invariants.vault_custody_balance, true)}
        hint={`${formatFpt(data.metadata.total_supply, true)} supply, fully accounted`}
        icon={<Anchor size={16} />}
        tone="ice"
      />
      <Stat
        label="Locked escrow"
        value={formatFpt(data.invariants.locked_escrow, true)}
        hint={
          data.invariants.vault_matches_escrow
            ? "vault equals the sum of open escrow"
            : "vault and escrow projection diverge"
        }
        icon={<Boxes size={16} />}
        tone={data.invariants.vault_matches_escrow ? "teal" : "coral"}
      />
      <Stat
        label="Settled envelope"
        value={formatFpt(settledVolume, true)}
        hint={`${settled.length} shipments settled by consensus or co-signature`}
        icon={<Snowflake size={16} />}
        tone="teal"
      />
      <Stat
        label="Invariant health"
        value={data.invariants.conserved ? "CONSERVED" : "DRIFT"}
        hint={`${riskCount} cold-chain risk events, ${data.shipments.length} orders tracked`}
        icon={<ShieldCheck size={16} />}
        tone={data.invariants.conserved ? "teal" : "coral"}
      />
    </div>
  );
}
