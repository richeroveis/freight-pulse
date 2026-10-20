import { Github, Radio, Volume2, VolumeX, Wallet } from "lucide-react";
import { REPO_URL } from "../config";
import { shortAddress } from "../lib/format";
import type { WalletSession } from "../lib/wallet";

export function Header({
  chainTime,
  source,
  session,
  muted,
  onToggleMute,
  onConnect,
}: {
  chainTime: number;
  source: "live" | "snapshot";
  session: WalletSession | null;
  muted: boolean;
  onToggleMute: () => void;
  onConnect: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-rail/60 bg-abyss/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="FreightPulse logo"
            className="h-9 w-9 rounded-lg border border-ice/30 bg-abyss object-cover shadow-glow"
          />
          <div>
            <p className="text-sm font-semibold tracking-[0.16em] text-white">FREIGHTPULSE</p>
            <p className="hidden text-[9px] uppercase tracking-[0.2em] text-mist/50 sm:block">
              Cold-chain cargo control tower
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist/60 lg:flex">
          <a href="#tower" className="transition hover:text-white">
            Control tower
          </a>
          <a href="#simulator" className="transition hover:text-white">
            Simulator
          </a>
          <a href="#guards" className="transition hover:text-white">
            Guard lab
          </a>
          <a href="#evidence" className="transition hover:text-white">
            Evidence
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <span
            className={`chip hidden sm:inline-flex ${
              source === "live" ? "border-teal/30 bg-teal/5 text-teal" : "border-amber/30 bg-amber/5 text-amber"
            }`}
          >
            <Radio size={10} /> {source === "live" ? "STUDIONET LIVE" : "CACHED SNAPSHOT"}
          </span>
          <span className="mono hidden text-[9px] text-mist/50 xl:inline">
            {chainTime ? new Date(chainTime * 1000).toISOString().slice(0, 16).replace("T", " ") : "--:--"} UTC
          </span>
          <button type="button" className="btn px-2 py-1.5" onClick={onToggleMute} title="Toggle sound">
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn hidden px-2 py-1.5 sm:inline-flex" title="Repository">
            <Github size={13} />
          </a>
          <button type="button" className="btn-primary px-2.5 py-1.5" onClick={onConnect}>
            {session ? (
              <>
                <Wallet size={12} /> {shortAddress(session.address)}
              </>
            ) : (
              <>
                <Wallet size={12} /> Connect
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
