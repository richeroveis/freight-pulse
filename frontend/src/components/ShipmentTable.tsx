import { useMemo, useState } from "react";
import { ChevronRight, Search, ShieldCheck, ThermometerSnowflake } from "lucide-react";
import type { Shipment } from "../types";
import { formatFpt, formatTemp, shortAddress } from "../lib/format";
import { BandBadge, StatusChip } from "./ui";
import { displayBand } from "../lib/settlement";

type Filter = "all" | "settled" | "active" | "risk";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All cargo" },
  { id: "active", label: "In flight" },
  { id: "settled", label: "Settled" },
  { id: "risk", label: "Risk" },
];

export function ShipmentTable({
  shipments,
  selectedId,
  onSelect,
}: {
  shipments: Shipment[];
  selectedId: number | null;
  onSelect: (shipment: Shipment) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return shipments.filter((shipment) => {
      const matchesQuery =
        !normalized ||
        shipment.bill_of_lading_id.toLowerCase().includes(normalized) ||
        shipment.route.toLowerCase().includes(normalized);
      if (!matchesQuery) return false;
      if (filter === "settled") return shipment.status === "SETTLED" || shipment.status === "RECLAIMED";
      if (filter === "active")
        return ["OPEN", "CARRIER_ACCEPTED", "MANIFEST_SUBMITTED", "AUDIT_VERIFIED"].includes(shipment.status);
      if (filter === "risk")
        return shipment.temp_breached || shipment.transit_over || shipment.fulfilment_band === "COLD_CHAIN_SPOILAGE_SLASH";
      return true;
    });
  }, [shipments, filter, query]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-rail/60 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">Fleet manifest</p>
            <h2 className="mt-1 text-base font-semibold text-white">Cargo control tower</h2>
          </div>
          <span className="chip border-teal/30 bg-teal/5 text-teal">
            <ShieldCheck size={11} /> {shipments.length} escrow orders
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-rail/70 bg-abyss/60 px-2.5 py-1.5">
            <Search size={13} className="text-mist/70" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bill of lading or lane"
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-mist/40"
            />
          </div>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                filter === item.id
                  ? "border-ice/50 bg-ice/10 text-ice"
                  : "border-rail/60 bg-deck/40 text-mist hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-hull/95 backdrop-blur">
            <tr className="text-[9px] uppercase tracking-[0.18em] text-mist/60">
              <th className="px-5 py-2.5 font-semibold">Bill of lading</th>
              <th className="px-3 py-2.5 font-semibold">State</th>
              <th className="px-3 py-2.5 font-semibold">Band</th>
              <th className="px-3 py-2.5 font-semibold">Telemetry</th>
              <th className="px-3 py-2.5 text-right font-semibold">Escrow</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((shipment) => {
              const selected = shipment.shipment_id === selectedId;
              const delta = (shipment.recorded_temp_c_x100 - shipment.max_temp_c_x100) / 100;
              return (
                <tr
                  key={shipment.shipment_id}
                  onClick={() => onSelect(shipment)}
                  className={`group cursor-pointer border-t border-rail/40 transition ${
                    selected ? "bg-ice/5" : "hover:bg-deck/50"
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          shipment.temp_breached ? "bg-coral" : "bg-teal"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="mono truncate text-[11px] font-semibold text-white">
                          {shipment.bill_of_lading_id}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-mist/70">{shipment.route}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip status={shipment.status} />
                  </td>
                  <td className="px-3 py-3">
                    <BandBadge band={displayBand(shipment)} compact />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <ThermometerSnowflake
                        size={12}
                        className={shipment.temp_breached ? "text-coral" : "text-ice"}
                      />
                      <span className="mono text-[11px] text-white/90">
                        {formatTemp(shipment.recorded_temp_c_x100)}
                      </span>
                      <span
                        className={`mono text-[9px] ${
                          shipment.temp_breached ? "text-coral" : "text-teal"
                        }`}
                      >
                        {shipment.recorded_temp_c_x100 > 0 ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}` : "waiting"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="mono text-[11px] text-white/90">{formatFpt(shipment.escrowed, true)}</p>
                    <p className="mt-0.5 text-[9px] text-mist/60">
                      {shortAddress(shipment.carrier_assigned ? shipment.carrier : shipment.shipper)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ChevronRight
                      size={15}
                      className={`transition ${selected ? "text-ice" : "text-mist/30 group-hover:text-ice"}`}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-xs text-mist/60">
                  No cargo matches this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
