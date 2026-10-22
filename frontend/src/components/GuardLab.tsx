import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import type { Shipment } from "../types";
import type { WalletSession } from "../lib/wallet";
import { GUARD_EVIDENCE } from "../data/evidence";
import { EXPLORER_URL } from "../config";
import { shortHash } from "../lib/format";
import { sendWrite, type WriteResult } from "../lib/genlayer";
import { proposeMutualRelease, submitDeliveryManifest } from "../lib/contractWrites";
import { sound } from "../lib/sound";

interface ProbeOutcome {
  label: string;
  hash: string;
  reverted: boolean;
  status: string;
  reason: string;
}

interface ProbeSpec {
  id: string;
  label: string;
  rule: string;
  send: (
    session: WalletSession,
    shipment: Shipment,
    chainNow: number,
  ) => Promise<WriteResult>;
}

// Each probe signs a live transaction that must trip a contract guard, so it is
// expected to revert in every shipment state. The revert reason is read back
// from the finalized receipt rather than asserted in the UI.
const PROBES: ProbeSpec[] = [
  {
    id: "untrusted-url",
    label: "Reject a non-HTTPS manifest URL",
    rule: "submit_delivery_manifest only accepts a public HTTPS document URL.",
    send: (session, shipment) =>
      submitDeliveryManifest(session, shipment.shipment_id, "http://insecure.example.com/manifest.txt"),
  },
  {
    id: "temp-ceiling",
    label: "Reject an out-of-range temperature",
    rule: "create_shipment_order bounds the ceiling to -90 C and 60 C.",
    send: (session, _shipment, chainNow) =>
      sendWrite(session, "create_shipment_order", [
        "BOL-GUARD-TEMP-999",
        "Geneva to Singapore Guard",
        999,
        18,
        1000 * 10 ** 6,
        400 * 10 ** 6,
        Math.floor(chainNow) + 3600,
      ]),
  },
  {
    id: "bps-ceiling",
    label: "Reject an out-of-range release split",
    rule: "propose_mutual_release bounds the carrier payout to 0 and 10000 bps.",
    send: (session, shipment) => proposeMutualRelease(session, shipment.shipment_id, 20000),
  },
];

export function GuardLab({
  session,
  shipment,
  chainTime,
}: {
  session: WalletSession | null;
  shipment: Shipment | null;
  chainTime: number;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, ProbeOutcome>>({});

  async function runProbe(probe: ProbeSpec) {
    if (!session || !shipment) return;
    setBusyId(probe.id);
    try {
      const result = await probe.send(session, shipment, chainTime || Math.floor(Date.now() / 1000));
      const reverted = Boolean(result.executionError);
      setOutcomes((current) => ({
        ...current,
        [probe.id]: {
          label: probe.label,
          hash: result.hash,
          reverted,
          status: result.status,
          reason: result.executionError ?? "No revert returned, the transaction was accepted.",
        },
      }));
      sound.play(reverted ? "revert" : "settle");
    } catch (error) {
      setOutcomes((current) => ({
        ...current,
        [probe.id]: {
          label: probe.label,
          hash: "",
          reverted: false,
          status: "SUBMISSION_FAILED",
          reason: error instanceof Error ? error.message : String(error),
        },
      }));
      sound.play("revert");
    } finally {
      setBusyId(null);
    }
  }

  const disabled = !session || !shipment;

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
          <ShieldAlert size={11} /> live transactions, expected to revert
        </span>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {PROBES.map((probe) => {
          const outcome = outcomes[probe.id];
          const busy = busyId === probe.id;
          const held = outcome?.reverted ?? false;
          return (
            <div key={probe.id} className="flex flex-col rounded-xl border border-rail/60 bg-deck/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-lg border p-2 ${held ? "border-teal/40 bg-teal/5 text-teal" : "border-coral/30 bg-coral/5 text-coral"}`}>
                  <ShieldAlert size={16} />
                </span>
                <span className={`chip ${held ? "border-teal/40 bg-teal/5 text-teal" : "border-rail bg-abyss/60 text-mist/60"}`}>
                  {busy ? "SIGNING" : held ? "GUARD HELD" : outcome ? "CHECK RESULT" : "IDLE"}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{probe.label}</h3>
              <p className="mt-1 flex-1 text-[10px] leading-5 text-mist/70">{probe.rule}</p>

              <div className="terminal mt-3 min-h-[70px] rounded-lg p-3 text-[9px] leading-5 text-mist/80">
                {busy ? (
                  <p className="flex items-center gap-1 text-ice">
                    <Loader2 size={10} className="animate-spin" /> waiting for FINALIZED receipt
                  </p>
                ) : outcome ? (
                  <>
                    <p className="terminal-line mono break-words text-ice">tx {shortHash(outcome.hash) || "n/a"}</p>
                    <p className={`terminal-line ${outcome.reverted ? "text-coral" : "text-amber"}`}>
                      {outcome.reverted ? "REVERT" : "ACCEPTED"}: {outcome.reason}
                    </p>
                  </>
                ) : (
                  <p className="text-mist/50">
                    {disabled ? "Connect a wallet and select a shipment to probe." : "Ready to sign a real reverting transaction."}
                  </p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" className="btn-primary" onClick={() => runProbe(probe)} disabled={busy || disabled}>
                  <FlaskConical size={12} /> {busy ? "Signing" : "Run live probe"}
                </button>
                {outcome?.hash ? (
                  <a
                    href={`${EXPLORER_URL}/transactions/${outcome.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono flex items-center gap-1 text-[9px] text-ice hover:text-white"
                  >
                    this tx <ExternalLink size={10} />
                  </a>
                ) : null}
              </div>
              {held ? (
                <p className="mt-2 flex items-center gap-1 text-[9px] text-teal">
                  <CheckCircle2 size={10} /> guard held, no funds moved
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-rail/60 px-5 py-3">
        <p className="label">Committed on-chain guard evidence</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {GUARD_EVIDENCE.map((probe) => (
            <div key={probe.id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-mist/70">{probe.revertReason.slice(0, 42)}</span>
              {probe.txHash ? (
                <a
                  href={`${EXPLORER_URL}/transactions/${probe.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-ice hover:text-white"
                >
                  {shortHash(probe.txHash)} <ExternalLink size={9} />
                </a>
              ) : (
                <span className="mono text-mist/40">pending</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9px] leading-4 text-mist/50">
          The buttons above sign new studionet transactions now. The links below are the historical
          studionet reverts recorded in evidence/studionet_deployment.json.
        </p>
      </div>
    </div>
  );
}
