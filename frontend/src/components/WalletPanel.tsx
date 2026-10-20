import { useState } from "react";
import { Check, Copy, Flame, LogOut, ShieldCheck, Wallet, Zap } from "lucide-react";
import { sendWrite } from "../lib/genlayer";
import { formatFpt, shortAddress } from "../lib/format";
import { sound } from "../lib/sound";
import type { WalletSession } from "../lib/wallet";

const FPT = 10 ** 6;

export function WalletPanel({
  session,
  balance,
  onConnectBurner,
  onConnectMetaMask,
  onDisconnect,
  onRefresh,
  busy,
  error,
}: {
  session: WalletSession | null;
  balance: number | null;
  onConnectBurner: () => void;
  onConnectMetaMask: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [faucetState, setFaucetState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [faucetMessage, setFaucetMessage] = useState("");

  async function copy() {
    if (!session) return;
    await navigator.clipboard.writeText(session.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function claimFaucet() {
    if (!session) return;
    setFaucetState("sending");
    setFaucetMessage("");
    try {
      const result = await sendWrite(session, "faucet_or_deposit", [100_000 * FPT]);
      if (result.accepted) {
        setFaucetState("done");
        setFaucetMessage("Faucet confirmed. Balance refreshed.");
        onRefresh();
        sound.play("settle");
      } else {
        setFaucetState("error");
        setFaucetMessage(result.executionError || "Faucet reverted.");
        sound.play("revert");
      }
    } catch (errorObject) {
      setFaucetState("error");
      setFaucetMessage(errorObject instanceof Error ? errorObject.message : "Faucet failed.");
      sound.play("revert");
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="label">Settlement wallet</p>
        <Wallet size={15} className="text-ice" />
      </div>

      {!session ? (
        <div className="mt-3 space-y-2">
          <button type="button" className="btn-primary w-full justify-start" onClick={onConnectBurner} disabled={busy}>
            <Flame size={14} /> 1-click burner wallet
          </button>
          <button type="button" className="btn w-full justify-start" onClick={onConnectMetaMask} disabled={busy}>
            <Zap size={14} /> Connect MetaMask
          </button>
          <p className="text-[10px] leading-4 text-mist/50">
            Burner keys live in memory for this session only. Never send real assets to a burner.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-rail/60 bg-deck/50 px-3 py-2">
            <div>
              <p className="mono text-xs font-semibold text-white">{shortAddress(session.address, 5)}</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-mist/50">
                {session.kind === "burner" ? "burner session" : "metamask"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="btn px-1.5 py-1" onClick={copy} title="Copy address">
                {copied ? <Check size={12} className="text-teal" /> : <Copy size={12} />}
              </button>
              <button type="button" className="btn px-1.5 py-1" onClick={onDisconnect} title="Disconnect">
                <LogOut size={12} />
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-ice/25 bg-ice/5 px-3 py-2">
            <p className="label text-ice/70">FPT balance</p>
            <p className="mono mt-1 text-lg font-semibold text-ice">
              {balance === null ? "reading..." : formatFpt(balance)}
            </p>
          </div>

          <button type="button" className="btn w-full" onClick={claimFaucet} disabled={faucetState === "sending"}>
            <Flame size={13} /> {faucetState === "sending" ? "Claiming..." : "Claim 100,000 test FPT"}
          </button>
          {faucetMessage ? (
            <p className={`text-[10px] leading-4 ${faucetState === "done" ? "text-teal" : "text-coral"}`}>
              {faucetMessage}
            </p>
          ) : null}
          {session.kind === "burner" ? (
            <p className="text-[9px] leading-4 text-mist/45">
              Burners need a small GEN gas balance. Use MetaMask for a funded account.
            </p>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-2 text-[10px] text-coral">{error}</p> : null}

      <div className="mt-3 flex items-center gap-1.5 border-t border-rail/50 pt-3 text-[9px] text-mist/50">
        <ShieldCheck size={10} className="text-teal" /> reads only by default, writes always require a signature
      </div>
    </div>
  );
}
