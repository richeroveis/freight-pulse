import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, SlidersHorizontal, Sparkles, ThermometerSnowflake, Timer } from "lucide-react";
import type { Band, Shipment } from "../types";
import { computeFulfilmentSplit, BAND_META } from "../lib/settlement";
import { formatFpt } from "../lib/format";
import { simulateOnChain } from "../lib/genlayer";
import { sound } from "../lib/sound";
import { BandBadge, Meter } from "./ui";

const FPT = 10 ** 6;

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  tone?: "ice" | "amber" | "coral" | "teal";
  onChange: (value: number) => void;
  icon?: React.ReactNode;
}

function SliderRow({ label, value, min, max, step, display, tone = "ice", onChange, icon }: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist/80">
          {icon}
          {label}
        </span>
        <span className={`mono text-xs font-semibold ${tone === "coral" ? "text-coral" : tone === "amber" ? "text-amber" : tone === "teal" ? "text-teal" : "text-ice"}`}>
          {display}
        </span>
      </div>
      <input
        type="range"
        className="input-range mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function Simulator({ shipment }: { shipment: Shipment }) {
  const initial = shipment;
  const [fee, setFee] = useState(initial.freight_fee || 185_000 * FPT);
  const [bond, setBond] = useState(initial.required_carrier_bond || 74_000 * FPT);
  const [temp, setTemp] = useState(initial.recorded_temp_c_x100 || 240);
  const [ceiling, setCeiling] = useState(initial.max_temp_c_x100 || 400);
  const [transit, setTransit] = useState(initial.recorded_transit_minutes || 972);
  const [sla, setSla] = useState(initial.max_transit_minutes || 1080);
  const [customs, setCustoms] = useState(initial.customs_cleared || initial.recorded_temp_c_x100 === 0);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<"idle" | "match" | "mismatch" | "error">("idle");
  const lastBand = useRef<Band | null>(null);

  useEffect(() => {
    setFee(initial.freight_fee || 185_000 * FPT);
    setBond(initial.required_carrier_bond || 74_000 * FPT);
    setTemp(initial.recorded_temp_c_x100 || 240);
    setCeiling(initial.max_temp_c_x100 || 400);
    setTransit(initial.recorded_transit_minutes || 972);
    setSla(initial.max_transit_minutes || 1080);
    setCustoms(initial.customs_cleared || initial.recorded_temp_c_x100 === 0);
    setVerification("idle");
  }, [initial.shipment_id, initial.freight_fee, initial.required_carrier_bond, initial.max_temp_c_x100, initial.max_transit_minutes, initial.recorded_temp_c_x100, initial.recorded_transit_minutes, initial.customs_cleared]);

  const split = computeFulfilmentSplit({
    telemetryPresent: true,
    customsCleared: customs,
    recordedTempCX100: temp,
    maxTempCX100: ceiling,
    recordedTransitMinutes: transit,
    maxTransitMinutes: sla,
    freightFee: fee,
    carrierBond: bond,
  });

  useEffect(() => {
    if (lastBand.current && lastBand.current !== split.fulfilmentBand) {
      if (split.fulfilmentBand === "FULL_ON_TIME_RELEASE") sound.play("full");
      else if (split.fulfilmentBand === "LATE_TRANSIT_PENALTY") sound.play("late");
      else if (split.fulfilmentBand === "COLD_CHAIN_SPOILAGE_SLASH") sound.play("spoilage");
    }
    lastBand.current = split.fulfilmentBand;
  }, [split.fulfilmentBand]);

  const meta = BAND_META[split.fulfilmentBand];
  const total = Math.max(1, fee + bond);

  async function verifyOnChain() {
    setVerifying(true);
    setVerification("idle");
    try {
      const onchain = await simulateOnChain({
        telemetryPresent: true,
        customsCleared: customs,
        recordedTempCX100: temp,
        maxTempCX100: ceiling,
        recordedTransitMinutes: transit,
        maxTransitMinutes: sla,
        freightFee: fee,
        carrierBond: bond,
      });
      const match =
        onchain.fulfilmentBand === split.fulfilmentBand &&
        onchain.carrierPayout === split.carrierPayout &&
        onchain.shipperRefund === split.shipperRefund;
      setVerification(match ? "match" : "mismatch");
      sound.play(match ? "settle" : "revert");
    } catch {
      setVerification("error");
      sound.play("revert");
    } finally {
      setVerifying(false);
    }
  }

  function reset() {
    setFee(initial.freight_fee || 185_000 * FPT);
    setBond(initial.required_carrier_bond || 74_000 * FPT);
    setTemp(initial.recorded_temp_c_x100 || 240);
    setCeiling(initial.max_temp_c_x100 || 400);
    setTransit(initial.recorded_transit_minutes || 972);
    setSla(initial.max_transit_minutes || 1080);
    setCustoms(initial.customs_cleared || initial.recorded_temp_c_x100 === 0);
    setVerification("idle");
    sound.play("click");
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rail/60 px-5 py-4">
        <div>
          <p className="label">Interactive settlement lab</p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
            <SlidersHorizontal size={15} className="text-ice" /> What-if cold-chain simulator
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={reset}>
            <RotateCcw size={13} /> Reset
          </button>
          <button type="button" className="btn-primary" onClick={verifyOnChain} disabled={verifying}>
            <Sparkles size={13} /> {verifying ? "Verifying..." : "Verify on chain"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <SliderRow
            label="Freight fee"
            value={fee}
            min={10_000 * FPT}
            max={500_000 * FPT}
            step={5_000 * FPT}
            display={formatFpt(fee)}
            onChange={setFee}
          />
          <SliderRow
            label="Carrier bond"
            value={bond}
            min={5_000 * FPT}
            max={200_000 * FPT}
            step={5_000 * FPT}
            display={formatFpt(bond)}
            onChange={setBond}
          />
          <div className="grid grid-cols-2 gap-4">
            <SliderRow
              label="Recorded peak"
              value={temp}
              min={-3000}
              max={2000}
              step={10}
              display={`${(temp / 100).toFixed(1)} C`}
              tone={temp > ceiling ? "coral" : "ice"}
              onChange={setTemp}
              icon={<ThermometerSnowflake size={11} />}
            />
            <SliderRow
              label="Ceiling"
              value={ceiling}
              min={-3000}
              max={2000}
              step={50}
              display={`${(ceiling / 100).toFixed(1)} C`}
              tone="amber"
              onChange={setCeiling}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SliderRow
              label="Transit"
              value={transit}
              min={0}
              max={2880}
              step={30}
              display={`${(transit / 60).toFixed(1)} h`}
              tone={transit > sla ? "amber" : "ice"}
              onChange={setTransit}
              icon={<Timer size={11} />}
            />
            <SliderRow
              label="SLA"
              value={sla}
              min={60}
              max={2880}
              step={30}
              display={`${(sla / 60).toFixed(1)} h`}
              tone="amber"
              onChange={setSla}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setCustoms((value) => !value);
              sound.play("click");
            }}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
              customs ? "border-teal/40 bg-teal/5" : "border-coral/40 bg-coral/5"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mist/80">
              Customs clearance
            </span>
            <span className={`mono text-xs font-semibold ${customs ? "text-teal" : "text-coral"}`}>
              {customs ? "CLEARED" : "REJECTED"}
            </span>
          </button>
          <div className="rounded-lg border border-rail/50 bg-abyss/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ice/80">Contract guard rails</p>
            <ul className="mt-1.5 space-y-1 text-[9px] leading-4 text-mist/60">
              <li>fee and bond must be positive and below the protocol ceiling</li>
              <li>deadline window is bounded to 180 seconds and 180 days</li>
              <li>temperature ceiling is bounded to -90 C and 60 C</li>
              <li>every projection is re-verified by the on-chain helper</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className={`rounded-xl border p-4 ${
              meta.tone === "coral"
                ? "border-coral/40 bg-coral/5"
                : meta.tone === "amber"
                  ? "border-amber/40 bg-amber/5"
                  : "border-teal/40 bg-teal/5"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="label">Projected band</p>
                <div className="mt-2">
                  <BandBadge band={split.fulfilmentBand} />
                </div>
              </div>
              {split.tempBreached ? (
                <AlertTriangle size={18} className="text-coral" />
              ) : (
                <CheckCircle2 size={18} className="text-teal" />
              )}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-mist/80">{meta.blurb}</p>
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <div className="flex items-center justify-between">
              <p className="label">Exact FPT distribution</p>
              <span className="mono text-[10px] text-mist/70">{formatFpt(fee + bond)}</span>
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-rail/60">
              <div className="h-full bg-teal transition-all duration-300" style={{ width: `${(split.carrierPayout / total) * 100}%` }} />
              <div className="h-full bg-ice transition-all duration-300" style={{ width: `${(split.shipperRefund / total) * 100}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <p className="label">Carrier</p>
                <p className="mono mt-1 text-sm font-semibold text-teal">{formatFpt(split.carrierPayout)}</p>
                <p className="mono mt-0.5 text-[9px] text-mist/60">
                  {split.carrierFeeBps / 100}% fee + {formatFpt(split.bondRefund, true)} bond
                </p>
              </div>
              <div>
                <p className="label">Shipper</p>
                <p className="mono mt-1 text-sm font-semibold text-ice">{formatFpt(split.shipperRefund)}</p>
                <p className="mono mt-0.5 text-[9px] text-mist/60">
                  slash {formatFpt(split.slashAmount, true)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-rail/50 bg-abyss/50 px-3 py-2">
              <span className="text-[10px] text-mist/70">Conservation</span>
              <span className={`mono text-[10px] font-semibold ${split.conservationOk ? "text-teal" : "text-coral"}`}>
                {split.carrierPayout + split.shipperRefund === fee + bond ? "EXACT" : "MISMATCH"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-rail/60 bg-deck/40 px-2 py-2 text-center">
              <p className="label">Temp</p>
              <p className={`mono mt-1 text-[10px] ${split.tempBreached ? "text-coral" : "text-teal"}`}>
                {split.tempBreached ? "BREACH" : "INTACT"}
              </p>
            </div>
            <div className="rounded-lg border border-rail/60 bg-deck/40 px-2 py-2 text-center">
              <p className="label">Transit</p>
              <p className={`mono mt-1 text-[10px] ${split.transitOver ? "text-amber" : "text-teal"}`}>
                {split.transitOver ? "OVER SLA" : "ON TIME"}
              </p>
            </div>
            <div className="rounded-lg border border-rail/60 bg-deck/40 px-2 py-2 text-center">
              <p className="label">Customs</p>
              <p className={`mono mt-1 text-[10px] ${customs ? "text-teal" : "text-coral"}`}>
                {customs ? "CLEARED" : "REJECTED"}
              </p>
            </div>
          </div>

          {verification !== "idle" ? (
            <div
              className={`rounded-lg border px-3 py-2 text-[10px] ${
                verification === "match"
                  ? "border-teal/40 bg-teal/5 text-teal"
                  : "border-coral/40 bg-coral/5 text-coral"
              }`}
            >
              {verification === "match"
                ? "On-chain simulate_settlement_split matches the local projection exactly."
                : verification === "mismatch"
                  ? "On-chain projection differs. Do not trust the local view."
                  : "On-chain verification unavailable (RPC rate limit or network). The local projection still follows the same helper."}
            </div>
          ) : null}

          <div>
            <div className="flex justify-between text-[9px] text-mist/60">
              <span>Fee utilisation</span>
              <span className="mono">{split.carrierFeeBps / 100}%</span>
            </div>
            <Meter value={split.carrierFeeBps} max={10000} tone={split.carrierFeeBps === 0 ? "coral" : "teal"} />
          </div>
        </div>
      </div>
    </div>
  );
}
