import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FlaskConical, Link2Off, ShieldAlert, Undo2 } from "lucide-react";
import type { ProbeId } from "../types";
import { GUARD_EVIDENCE } from "../data/evidence";
import { EXPLORER_URL } from "../config";
import { shortHash } from "../lib/format";
import { sound } from "../lib/sound";

type ResultState = "idle" | "running" | "held";

const PROBE_ICONS: Record<ProbeId, React.ReactNode> = {
  "unilateral-release": <Undo2 size={16} />,
  "premature-reclaim": <ShieldAlert size={16} />,
  "untrusted-url": <Link2Off size={16} />,
};

const PROBE_SCRIPTS: Record<ProbeId, string[]> = {
  "unilateral-release": [
    "propose_mutual_release(shipment, 8500)",
    "require caller == shipper || caller == carrier",
    "outsider identity detected",
  ],
  "premature-reclaim": [
    "reclaim_expired_shipment(shipment)",
    "require status in (OPEN, CARRIER_ACCEPTED)",
    "status == MANIFEST_SUBMITTED",
  ],
  "untrusted-url": [
    "submit_delivery_manifest(shipment, url)",
    "require scheme == https",
    "http://insecure.example.com rejected",
  ],
};

const SCRIPT_DELAY = 380;

export function GuardLab() {
  const [states, setStates] = useState<Record<ProbeId, ResultState>>({
    "unilateral-release": "idle",
    "premature-reclaim": "idle",
    "untrusted-url": "idle",
  });
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function run(id: ProbeId) {
    sound.play("click");
    setStates((current) => ({ ...current, [id]: "running" }));
    PROBE_SCRIPTS[id].forEach((_, index) => {
      const timer = window.setTimeout(() => {
        if (index === PROBE_SCRIPTS[id].length - 1) {
          sound.play("revert");
        }
      }, (index + 1) * SCRIPT_DELAY);
      timers.current.push(timer);
    });
    const finish = window.setTimeout(() => {
      setStates((current) => ({ ...current, [id]: "held" }));
      sound.play("settle");
    }, (PROBE_SCRIPTS[id].length + 1) * SCRIPT_DELAY);
    timers.current.push(finish);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rail/60 px-5 py-4">
        <div>
          <p className="label">Adversarial verification</p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
            <FlaskConical size={15} className="text-coral" /> Security guard lab
          </h2>
        </div>
        <span className="chip border-coral/30 bg-coral/5 text-coral">
          <ShieldAlert size={11} /> 3 probes, 4 on-chain reverts
        </span>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {GUARD_EVIDENCE.map((probe) => {
          const state = states[probe.id];
          return (
            <div key={probe.id} className="flex flex-col rounded-xl border border-rail/60 bg-deck/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-lg border p-2 ${state === "held" ? "border-teal/40 bg-teal/5 text-teal" : "border-coral/30 bg-coral/5 text-coral"}`}>
                  {PROBE_ICONS[probe.id]}
                </span>
                <span className={`chip ${state === "held" ? "border-teal/40 bg-teal/5 text-teal" : "border-rail bg-abyss/60 text-mist/60"}`}>
                  {state === "held" ? "GUARD HELD" : state === "running" ? "PROBING" : "IDLE"}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{probe.label}</h3>
              <p className="mt-1 flex-1 text-[10px] leading-5 text-mist/70">{probe.rule}</p>

              <div className="terminal mt-3 min-h-[88px] rounded-lg p-3 text-[9px] leading-5 text-mist/80">
                <p className="terminal-line text-ice">{PROBE_SCRIPTS[probe.id][0]}</p>
                {state !== "idle" ? (
                  <>
                    <p className="terminal-line text-mist/60">{PROBE_SCRIPTS[probe.id][1]}</p>
                    <p className="terminal-line text-amber">{PROBE_SCRIPTS[probe.id][2]}</p>
                  </>
                ) : null}
                {state === "held" ? (
                  <p className="mt-1 flex items-start gap-1 text-coral">
                    <ShieldAlert size={10} className="mt-0.5 shrink-0" />
                    <span>REVERT {probe.revertReason}</span>
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" className="btn-primary" onClick={() => run(probe.id)} disabled={state === "running"}>
                  <FlaskConical size={12} /> {state === "running" ? "Running" : "Run probe"}
                </button>
                {probe.txHash ? (
                  <a
                    href={`${EXPLORER_URL}/transactions/${probe.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono flex items-center gap-1 text-[9px] text-ice hover:text-white"
                  >
                    {shortHash(probe.txHash)} <ExternalLink size={10} />
                  </a>
                ) : (
                  <span className="mono text-[9px] text-mist/40">evidence pending</span>
                )}
              </div>
              {state === "held" ? (
                <p className="mt-2 flex items-center gap-1 text-[9px] text-teal">
                  <CheckCircle2 size={10} /> state unchanged, no funds moved
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="border-t border-rail/60 px-5 py-3 text-[10px] text-mist/50">
        Probes are evaluated locally against the deployed contract rules. The explorer links point to
        real studionet transactions that reverted with the same guard reason.
      </div>
    </div>
  );
}
