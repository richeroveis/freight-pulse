import { useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  Blocks,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  FileJson,
  Fingerprint,
  Layers,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Ship,
  Snowflake,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { DashboardData, Shipment } from "./types";
import {
  CONTRACT_ADDRESS,
  DEMO_VIDEO_URL,
  EVIDENCE_URL,
  EXPLORER_URL,
  PRINCIPLE_TEXT,
  REPO_URL,
} from "./config";
import { SNAPSHOT } from "./data/snapshot";
import { DEPLOY_TX_HASH, FOUR_WAY, GUARD_EVIDENCE } from "./data/evidence";
import { loadDashboard, readFptBalance } from "./lib/genlayer";
import { sound } from "./lib/sound";
import { connectMetaMask, createBurnerSession, type WalletSession } from "./lib/wallet";
import { formatFpt, shortAddress } from "./lib/format";
import { BAND_META } from "./lib/settlement";
import { Header } from "./components/Header";
import { KpiRow } from "./components/KpiRow";
import { ShipmentTable } from "./components/ShipmentTable";
import { ShipmentDetail } from "./components/ShipmentDetail";
import { Simulator } from "./components/Simulator";
import { GuardLab } from "./components/GuardLab";
import { ConsensusDrawer } from "./components/ConsensusDrawer";
import { WalletPanel } from "./components/WalletPanel";
import { BandBadge, EmptyState, SectionTitle } from "./components/ui";

export default function App() {
  const [data, setData] = useState<DashboardData>(SNAPSHOT);
  const [selectedId, setSelectedId] = useState<number | null>(SNAPSHOT.shipments[0]?.shipment_id ?? null);
  const [loading, setLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const live = await loadDashboard();
      if (live.shipments.length === 0) {
        setData(SNAPSHOT);
        setLiveError("The contract returned no shipments. Showing the committed demo snapshot.");
      } else {
        setData(live);
        setLiveError(null);
        setSelectedId((current) => {
          if (current !== null && live.shipments.some((shipment) => shipment.shipment_id === current)) {
            return current;
          }
          const preferred = live.shipments.find((shipment) => shipment.status === "SETTLED") ?? live.shipments[0];
          return preferred.shipment_id;
        });
      }
    } catch (error) {
      setData(SNAPSHOT);
      setLiveError(
        error instanceof Error
          ? `Live reads are unavailable (${error.message.slice(0, 90)}). Showing the committed demo snapshot.`
          : "Live reads are unavailable. Showing the committed demo snapshot.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => data.shipments.find((shipment) => shipment.shipment_id === selectedId) ?? data.shipments[0],
    [data.shipments, selectedId],
  );

  const settledCount = data.shipments.filter((shipment) => shipment.status === "SETTLED").length;
  const riskCount = data.shipments.filter(
    (shipment) => shipment.temp_breached || shipment.fulfilment_band === "COLD_CHAIN_SPOILAGE_SLASH",
  ).length;

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    if (!next) sound.play("click");
  }

  function selectShipment(shipment: Shipment) {
    setSelectedId(shipment.shipment_id);
    sound.play("click");
  }

  async function refreshBalance(nextSession: WalletSession | null = session) {
    if (!nextSession) {
      setBalance(null);
      return;
    }
    try {
      const value = await readFptBalance(nextSession.address);
      setBalance(value);
    } catch {
      setBalance(null);
    }
  }

  async function connectBurner() {
    setWalletBusy(true);
    setWalletError(null);
    try {
      const next = createBurnerSession();
      setSession(next);
      sound.play("wallet");
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.2 }, colors: ["#7FE3F0", "#2DD4BF", "#FB7185"] });
      await refreshBalance(next);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not create a burner wallet.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function connectWallet() {
    setWalletBusy(true);
    setWalletError(null);
    try {
      const next = await connectMetaMask();
      setSession(next);
      sound.play("wallet");
      await refreshBalance(next);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "MetaMask connection failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  function disconnect() {
    setSession(null);
    setBalance(null);
    setWalletError(null);
    sound.play("click");
  }

  function openSimulator() {
    document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth", block: "start" });
    sound.play("drawer");
  }

  return (
    <div className="min-h-screen">
      <Header
        chainTime={data.chainTime}
        source={data.source}
        session={session}
        muted={muted}
        onToggleMute={toggleMute}
        onConnect={session ? () => document.getElementById("wallet")?.scrollIntoView({ behavior: "smooth" }) : connectWallet}
      />

      <main className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6">
        <section className="panel relative overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-ice/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-coral/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.45fr_1fr]">
            <div className="fade-up">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip border-ice/30 bg-ice/5 text-ice">
                  <Ship size={11} /> GenLayer studionet 61999
                </span>
                <span className="chip border-teal/30 bg-teal/5 text-teal">
                  <ShieldCheck size={11} /> no owner, no admin, no bypass
                </span>
                <span className="chip border-amber/30 bg-amber/5 text-amber">
                  <Snowflake size={11} /> cold-chain telemetry
                </span>
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl xl:text-[42px]">
                AI-audited cold-chain fulfilment,
                <span className="text-ice"> settled by validator consensus.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-mist/80">
                FreightPulse locks shipper fees and carrier bonds in a real FPT vault. A shipment is
                released only when independent validators fetch the carrier manifest, agree on customs,
                peak temperature and transit, and derive one discrete settlement band. The contract has
                no owner override and no emergency withdrawal.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary" onClick={openSimulator}>
                  <PlayCircle size={14} /> Explore the what-if simulator
                </button>
                <a href={EVIDENCE_URL} target="_blank" rel="noreferrer" className="btn">
                  <FileJson size={14} /> On-chain evidence
                </a>
                <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="btn">
                  <PlayCircle size={14} /> Demo video
                </a>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-[10px] text-mist/60">
                <span className="mono flex items-center gap-1.5">
                  <Fingerprint size={11} className="text-teal" /> {shortAddress(CONTRACT_ADDRESS, 6)}
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-teal" /> {settledCount} settled
                </span>
                <span className="flex items-center gap-1.5">
                  <TriangleAlert size={11} className="text-coral" /> {riskCount} risk events
                </span>
                <span className="flex items-center gap-1.5">
                  <Blocks size={11} className="text-ice" /> {data.invariants.shipment_count} escrow orders
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="panel-soft p-4">
                <div className="flex items-center justify-between">
                  <p className="label">Vault custody</p>
                  <Database size={14} className="text-ice" />
                </div>
                <p className="mono mt-2 text-xl font-semibold text-ice">
                  {formatFpt(data.invariants.vault_custody_balance, true)}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-mist/60">
                  Locked against {formatFpt(data.invariants.locked_escrow, true)} of open escrow
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <span className={data.invariants.vault_matches_escrow ? "text-teal" : "text-coral"}>
                    {data.invariants.vault_matches_escrow ? "vault == escrow" : "vault drift"}
                  </span>
                  <span className="mono text-mist/50">{data.metadata.symbol}</span>
                </div>
              </div>
              <div className="panel-soft p-4">
                <div className="flex items-center justify-between">
                  <p className="label">Invariant health</p>
                  <Layers size={14} className="text-teal" />
                </div>
                <p className={`mono mt-2 text-xl font-semibold ${data.invariants.conserved ? "text-teal" : "text-coral"}`}>
                  {data.invariants.conserved ? "CONSERVED" : "DRIFT"}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-mist/60">
                  balances + vault == total supply, every settled band conserves fee + bond
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="chip border-teal/30 bg-teal/5 text-teal">4-way sha256</span>
                  <span className="chip border-ice/30 bg-ice/5 text-ice">direct tests 93</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {liveError ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-[11px] leading-5 text-amber">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{liveError}</span>
          </div>
        ) : null}

        <KpiRow data={data} />

        <div id="tower" className="grid gap-4 xl:grid-cols-[1fr_330px]">
          <div className="space-y-4">
            <ShipmentTable shipments={data.shipments} selectedId={selected?.shipment_id ?? null} onSelect={selectShipment} />
            {selected ? (
              <ShipmentDetail
                shipment={selected}
                shipments={data.shipments}
                chainTime={data.chainTime}
                onOpenConsensus={() => {
                  setDrawerOpen(true);
                  sound.play("drawer");
                }}
                onSimulate={openSimulator}
              />
            ) : (
              <EmptyState message="No shipments are available on chain yet." />
            )}
          </div>

          <div className="space-y-4">
            <div id="wallet">
              <WalletPanel
                session={session}
                balance={balance}
                onConnectBurner={connectBurner}
                onConnectMetaMask={connectWallet}
                onDisconnect={disconnect}
                onRefresh={() => void refreshBalance()}
                busy={walletBusy}
                error={walletError}
              />
            </div>

            <div className="panel p-4">
              <div className="flex items-center justify-between">
                <p className="label">Protocol invariants</p>
                <button type="button" className="btn px-2 py-1" onClick={() => void refresh()} disabled={loading}>
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? "Syncing" : "Refresh"}
                </button>
              </div>
              <div className="mt-3 space-y-2 text-[10px]">
                {[
                  ["vault == locked escrow", data.invariants.vault_matches_escrow],
                  ["balances + vault == supply", data.invariants.supply_matches_balances_plus_vault],
                  ["settled bands conserve", data.invariants.settled_conservation_ok],
                  ["no owner settlement path", true],
                ].map(([label, ok]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg border border-rail/50 bg-deck/40 px-2.5 py-2">
                    <span className="text-mist/70">{label as string}</span>
                    <span className={`mono ${ok ? "text-teal" : "text-coral"}`}>{ok ? "PASS" : "FAIL"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] leading-4 text-mist/45">
                Source: check_vault_invariants view. Read-only, four RPC calls on first paint.
              </p>
            </div>

            <div className="panel p-4">
              <p className="label">Settlement bands</p>
              <div className="mt-3 space-y-2">
                {(
                  [
                    "FULL_ON_TIME_RELEASE",
                    "LATE_TRANSIT_PENALTY",
                    "COLD_CHAIN_SPOILAGE_SLASH",
                  ] as const
                ).map((band) => (
                  <div key={band} className="rounded-lg border border-rail/50 bg-deck/40 px-2.5 py-2">
                    <BandBadge band={band} compact />
                    <p className="mt-1.5 text-[9px] leading-4 text-mist/60">{BAND_META[band].blurb}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <p className="label">Consensus principle</p>
              <p className="mt-2 text-[10px] leading-5 text-mist/70">{PRINCIPLE_TEXT}</p>
              <a
                href={`${REPO_URL}/blob/main/contracts/freight_pulse.py`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[10px] text-ice hover:text-white"
              >
                <BookOpen size={11} /> read the contract <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>

        <section id="simulator" className="scroll-mt-24">
          {selected ? <Simulator shipment={selected} /> : null}
        </section>

        <section id="guards" className="scroll-mt-24">
          <GuardLab />
        </section>

        <section id="evidence" className="panel scroll-mt-24 overflow-hidden">
          <SectionTitle
            eyebrow="Verifiable delivery"
            title="Evidence, hashes and deployment identity"
            action={
              <a href={EVIDENCE_URL} target="_blank" rel="noreferrer" className="btn">
                <FileJson size={13} /> evidence JSON
              </a>
            }
          />
          <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3">
              <div className="rounded-xl border border-ice/25 bg-ice/5 p-4">
                <p className="label text-ice/70">Deployed contract</p>
                <p className="mono mt-1 break-all text-xs text-white">{CONTRACT_ADDRESS}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                  >
                    <ExternalLink size={12} /> explorer
                  </a>
                  {DEPLOY_TX_HASH ? (
                    <a
                      href={`${EXPLORER_URL}/transactions/${DEPLOY_TX_HASH}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn"
                    >
                      <FileJson size={12} /> deploy tx
                    </a>
                  ) : null}
                  <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn">
                    <BookOpen size={12} /> repository
                  </a>
                </div>
              </div>
              <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
                <p className="label">Guard evidence on studionet</p>
                <div className="mt-2 space-y-2">
                  {GUARD_EVIDENCE.map((probe) => (
                    <div key={probe.id} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-mist/70">{probe.label}</span>
                      {probe.txHash ? (
                        <a
                          href={`${EXPLORER_URL}/transactions/${probe.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-ice hover:text-white"
                        >
                          {probe.txHash.slice(0, 10)}...
                        </a>
                      ) : (
                        <span className="mono text-mist/40">pending</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
                <p className="label">4-way sha256 identity</p>
                <div className="mt-2 space-y-2">
                  {[
                    ["local contract file", FOUR_WAY.contractFile],
                    ["git blob at HEAD", FOUR_WAY.gitBlob],
                    ["deploy payload", FOUR_WAY.deployPayload],
                    ["on-chain source", FOUR_WAY.onChain],
                  ].map(([label, hash]) => (
                    <div key={String(label)} className="rounded-lg border border-rail/50 bg-abyss/50 px-3 py-2">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-mist/50">{label as string}</p>
                      <p className="mono mt-0.5 break-all text-[9px] text-white/80">{hash as string}</p>
                    </div>
                  ))}
                </div>
                <p className={`mt-2 flex items-center gap-1.5 text-[10px] ${FOUR_WAY.allMatch ? "text-teal" : "text-amber"}`}>
                  {FOUR_WAY.allMatch ? <CheckCircle2 size={11} /> : <TriangleAlert size={11} />}
                  {FOUR_WAY.allMatch ? "all four digests match" : "digests pending regeneration"}
                </p>
              </div>
              <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
                <p className="label">What the contract owns</p>
                <ul className="mt-2 space-y-1.5 text-[10px] leading-5 text-mist/70">
                  <li>the escrow vault and every balance mutation</li>
                  <li>the discrete band, payout split and conservation check</li>
                  <li>the validator comparison rule and post-consensus re-verification</li>
                  <li>the mutual release co-signature and the timed reclaim boundary</li>
                </ul>
                <p className="mt-3 text-[9px] leading-4 text-mist/45">
                  The frontend owns presentation, previews and wallet UX. It never decides a settlement.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-rail/50 py-5 text-[10px] text-mist/50 sm:flex-row">
          <span className="flex items-center gap-1.5">
            <Wallet size={11} /> FreightPulse, MIT licensed, built for GenLayer studionet
          </span>
          <span className="flex items-center gap-3">
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer" className="hover:text-white">
              README
            </a>
            <a href={EVIDENCE_URL} target="_blank" rel="noreferrer" className="hover:text-white">
              evidence
            </a>
            <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
              <ArrowRight size={10} /> demo
            </a>
          </span>
        </footer>
      </main>

      {selected ? (
        <ConsensusDrawer shipment={selected} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      ) : null}
    </div>
  );
}
