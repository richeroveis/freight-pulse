import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CircleDollarSign,
  ExternalLink,
  FileSignature,
  HandCoins,
  Loader2,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  Ship,
  Sparkles,
  TimerReset,
  UploadCloud,
  Wallet,
} from "lucide-react";
import type { Shipment } from "../types";
import type { WalletSession } from "../lib/wallet";
import type { WriteResult } from "../lib/genlayer";
import { EXPLORER_URL, MANIFEST_ASSET_BASE } from "../config";
import { formatClock, shortAddress } from "../lib/format";
import {
  acceptShipmentBid,
  auditShipmentFulfilmentLive,
  claimShipmentSettlement,
  createShipmentOrder,
  proposeMutualRelease,
  reclaimExpiredShipment,
  submitDeliveryManifest,
  transferTokens,
  validateBps,
  validateCreateOrder,
  validateManifestUrl,
  type CreateOrderInput,
} from "../lib/contractWrites";
import { sound } from "../lib/sound";

interface ActiveWrite {
  label: string;
  expectedRevert: boolean;
}

interface ResultEntry extends WriteResult {
  label: string;
  expectedRevert: boolean;
}

const KNOWN_MANIFESTS = [
  "gva-sin-biologics.txt",
  "rtm-tyo-photoresist.txt",
  "osl-nyc-seafood.txt",
  "rtm-note.txt",
  "lax-bcn-aerospace.txt",
].filter((name) => name !== "rtm-note.txt");

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mist/70">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[9px] leading-4 text-mist/45">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-rail/60 bg-abyss/60 px-3 py-2 text-xs text-white outline-none placeholder:text-mist/40 focus:border-ice/60";

export function ControlDeck({
  session,
  chainTime,
  shipment,
  onAfterWrite,
}: {
  session: WalletSession | null;
  chainTime: number;
  shipment: Shipment | null;
  onAfterWrite: () => void;
}) {
  const [active, setActive] = useState<ActiveWrite | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [order, setOrder] = useState<CreateOrderInput>({
    billOfLadingId: "BOL-UI-DEMO-001",
    route: "Geneva to Singapore",
    tempC: 4,
    transitHours: 18,
    freightFeeWholeFpt: 2000,
    carrierBondWholeFpt: 800,
    deadlineLeadSeconds: 3600,
  });
  const [manifestUrl, setManifestUrl] = useState("");
  const [shipperBps, setShipperBps] = useState(8500);
  const [carrierBps, setCarrierBps] = useState(8500);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState(100);
  const busy = active !== null;
  const address = session?.address ?? "";
  const now = chainTime || Math.floor(Date.now() / 1000);

  const gating = useMemo(() => {
    if (!shipment) return null;
    const isShipper = address !== "" && address.toLowerCase() === shipment.shipper.toLowerCase();
    const isCarrier = address !== "" && address.toLowerCase() === shipment.carrier.toLowerCase();
    const deadlinePassed = now >= shipment.delivery_deadline_clock;
    return {
      canAccept: shipment.status === "OPEN" && !isShipper && !deadlinePassed,
      canSubmitManifest: shipment.status === "CARRIER_ACCEPTED" && isCarrier && !deadlinePassed,
      canAudit: shipment.status === "MANIFEST_SUBMITTED",
      canClaim: shipment.status === "AUDIT_VERIFIED",
      canMutualRelease:
        (shipment.status === "CARRIER_ACCEPTED" || shipment.status === "MANIFEST_SUBMITTED") &&
        (isShipper || isCarrier),
      isParty: isShipper || isCarrier,
      isShipper,
      isCarrier,
      reclaimBlockedReason: (() => {
        if (!isShipper) return "Only the shipper can reclaim this order.";
        if (shipment.status === "MANIFEST_SUBMITTED")
          return "A manifest was submitted on time, reclaim is blocked pending verification.";
        if (shipment.status === "AUDIT_IN_PROGRESS" || shipment.status === "AUDIT_VERIFIED")
          return "A live verification already ran, reclaim is blocked.";
        if (shipment.status !== "OPEN" && shipment.status !== "CARRIER_ACCEPTED")
          return "This shipment is already closed and cannot be reclaimed.";
        if (!deadlinePassed)
          return `Reclaim unlocks after the deadline ${formatClock(shipment.delivery_deadline_clock)}.`;
        return null;
      })(),
    };
  }, [shipment, address, now]);

  function pushResult(entry: ResultEntry) {
    setResults((current) => [entry, ...current].slice(0, 6));
  }

  async function run(label: string, expectedRevert: boolean, task: () => Promise<WriteResult>) {
    if (!session) return;
    setActive({ label, expectedRevert });
    setFormErrors([]);
    try {
      const result = await task();
      pushResult({ ...result, label, expectedRevert });
      const succeeded = result.accepted;
      if (expectedRevert) {
        sound.play(succeeded ? "click" : "revert");
      } else {
        sound.play(succeeded ? "settle" : "revert");
        if (succeeded) onAfterWrite();
      }
    } catch (error) {
      pushResult({
        hash: "",
        accepted: false,
        status: "SUBMISSION_FAILED",
        finalized: false,
        executionError: error instanceof Error ? error.message : String(error),
        raw: null,
        label,
        expectedRevert,
      });
      sound.play("revert");
    } finally {
      setActive(null);
    }
  }

  function handleCreate() {
    if (!session) return;
    const errors = validateCreateOrder(order);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    void run("create shipment order", false, () => createShipmentOrder(session, order, now));
  }

  function handleSubmitManifest() {
    if (!session || !shipment) return;
    const error = validateManifestUrl(manifestUrl);
    if (error) {
      setFormErrors([error]);
      return;
    }
    void run("submit delivery manifest", false, () =>
      submitDeliveryManifest(session, shipment.shipment_id, manifestUrl),
    );
  }

  function handleMutualRelease(role: "shipper" | "carrier") {
    if (!session || !shipment) return;
    const bps = role === "shipper" ? shipperBps : carrierBps;
    const error = validateBps(bps);
    if (error) {
      setFormErrors([error]);
      return;
    }
    void run(`propose mutual release as ${role}`, false, () =>
      proposeMutualRelease(session, shipment.shipment_id, bps),
    );
  }

  function handleTransfer() {
    if (!session) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(transferTo.trim())) {
      setFormErrors(["Recipient must be a 0x address."]);
      return;
    }
    if (!Number.isInteger(transferAmount) || transferAmount <= 0) {
      setFormErrors(["Transfer amount must be a positive whole FPT number."]);
      return;
    }
    void run("transfer FPT", false, () => transferTokens(session, transferTo, transferAmount));
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rail/60 px-5 py-4">
        <div>
          <p className="label">Lifecycle control deck</p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
            <Ship size={15} className="text-ice" /> Sign real contract transactions
          </h2>
        </div>
        {session ? (
          <span className="chip border-teal/30 bg-teal/5 text-teal">
            <Wallet size={11} /> {shortAddress(address, 5)} ({session.kind})
          </span>
        ) : (
          <span className="chip border-amber/30 bg-amber/5 text-amber">
            <ShieldAlert size={11} /> connect a wallet to sign
          </span>
        )}
      </div>

      {!session ? (
        <p className="px-5 py-4 text-[11px] text-mist/60">
          Every action below maps to a contract write method and is sent with writeContract, then
          polled to FINALIZED. Connect a burner wallet or MetaMask in the settlement wallet panel to
          enable signing.
        </p>
      ) : null}

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <p className="label flex items-center gap-1.5">
              <PlusCircle size={12} className="text-ice" /> 1. Create shipment order
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Bill of lading reference">
                  <input
                    className={INPUT_CLASS}
                    value={order.billOfLadingId}
                    onChange={(event) => setOrder({ ...order, billOfLadingId: event.target.value })}
                  />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Route">
                  <input
                    className={INPUT_CLASS}
                    value={order.route}
                    onChange={(event) => setOrder({ ...order, route: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Temp ceiling (C)" hint="Whole degrees, stored as hundredths on chain">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={order.tempC}
                  onChange={(event) => setOrder({ ...order, tempC: Number(event.target.value) })}
                />
              </Field>
              <Field label="Transit SLA (hours)" hint="Whole hours, stored as minutes on chain">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={order.transitHours}
                  onChange={(event) => setOrder({ ...order, transitHours: Number(event.target.value) })}
                />
              </Field>
              <Field label="Freight fee (FPT)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={order.freightFeeWholeFpt}
                  onChange={(event) =>
                    setOrder({ ...order, freightFeeWholeFpt: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Carrier bond (FPT)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={order.carrierBondWholeFpt}
                  onChange={(event) =>
                    setOrder({ ...order, carrierBondWholeFpt: Number(event.target.value) })
                  }
                />
              </Field>
              <div className="col-span-2">
                <Field label="Delivery deadline, seconds from now" hint="Allowed range 180 s to 180 days">
                  <input
                    type="number"
                    className={INPUT_CLASS}
                    value={order.deadlineLeadSeconds}
                    onChange={(event) =>
                      setOrder({ ...order, deadlineLeadSeconds: Number(event.target.value) })
                    }
                  />
                </Field>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={handleCreate}
              disabled={busy}
            >
              {busy && active?.label === "create shipment order" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <PlusCircle size={13} />
              )}
              create_shipment_order
            </button>
          </div>

          <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
            <p className="label flex items-center gap-1.5">
              <ArrowRightLeft size={12} className="text-ice" /> Transfer FPT tokens
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Recipient address">
                  <input
                    className={INPUT_CLASS}
                    value={transferTo}
                    placeholder="0x..."
                    onChange={(event) => setTransferTo(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Amount (FPT)">
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(Number(event.target.value))}
                />
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn w-full"
                  onClick={handleTransfer}
                  disabled={busy}
                >
                  <CircleDollarSign size={13} /> transfer_tokens
                </button>
              </div>
            </div>
          </div>

          {formErrors.length > 0 ? (
            <div className="rounded-lg border border-coral/40 bg-coral/5 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-coral">
                <ShieldAlert size={11} /> Rejected before signing
              </p>
              <ul className="mt-1.5 space-y-1 text-[10px] leading-4 text-coral/90">
                {formErrors.map((message) => (
                  <li key={message}>- {message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {shipment ? (
            <ActionColumn
              shipment={shipment}
              gating={gating}
              busy={busy}
              activeLabel={active?.label ?? null}
              manifestUrl={manifestUrl}
              setManifestUrl={setManifestUrl}
              shipperBps={shipperBps}
              carrierBps={carrierBps}
              setShipperBps={setShipperBps}
              setCarrierBps={setCarrierBps}
              onAccept={() => session && run("accept shipment bid", false, () => acceptShipmentBid(session, shipment.shipment_id))}
              onSubmitManifest={handleSubmitManifest}
              onAudit={() => session && run("run live audit", false, () => auditShipmentFulfilmentLive(session, shipment.shipment_id))}
              onClaim={() => session && run("claim settlement", false, () => claimShipmentSettlement(session, shipment.shipment_id))}
              onReleaseShipper={() => handleMutualRelease("shipper")}
              onReleaseCarrier={() => handleMutualRelease("carrier")}
              onReclaim={() => session && run("reclaim expired shipment", false, () => reclaimExpiredShipment(session, shipment.shipment_id))}
            />
          ) : (
            <EmptyPanel message="Select a shipment in the control tower to expose its lifecycle actions." />
          )}

          <TxResults results={results} onRetryRefresh={onAfterWrite} />
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-rail/70 bg-deck/30 p-6 text-center text-xs text-mist/70">
      {message}
    </div>
  );
}

interface ActionProps {
  shipment: Shipment;
  gating: ReturnType<() => any> | null;
  busy: boolean;
  activeLabel: string | null;
  manifestUrl: string;
  setManifestUrl: (value: string) => void;
  shipperBps: number;
  carrierBps: number;
  setShipperBps: (value: number) => void;
  setCarrierBps: (value: number) => void;
  onAccept: () => void;
  onSubmitManifest: () => void;
  onAudit: () => void;
  onClaim: () => void;
  onReleaseShipper: () => void;
  onReleaseCarrier: () => void;
  onReclaim: () => void;
}

function ActionColumn(props: ActionProps) {
  const { shipment, gating, busy, activeLabel } = props;
  const spinning = (label: string) => busy && activeLabel === label;
  return (
    <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
      <div className="flex items-center justify-between">
        <p className="label">Shipment #{shipment.shipment_id} actions</p>
        <span className="mono text-[9px] text-mist/50">{shipment.bill_of_lading_id}</span>
      </div>

      <div className="mt-3 space-y-2">
        <ActionButton
          icon={<Ship size={13} />}
          label="accept_shipment_bid"
          hint="Carrier locks the bond to accept an open order."
          disabled={busy || !gating?.canAccept}
          spinning={spinning("accept shipment bid")}
          onClick={props.onAccept}
        />

        <div className="rounded-lg border border-rail/50 bg-abyss/40 p-3">
          <Field label="Delivery manifest URL (public https)">
            <input
              className={INPUT_CLASS}
              list="manifest-options"
              placeholder="https://raw.githubusercontent.com/..."
              value={props.manifestUrl}
              onChange={(event) => props.setManifestUrl(event.target.value)}
            />
          </Field>
          <datalist id="manifest-options">
            {KNOWN_MANIFESTS.map((name) => (
              <option key={name} value={`${MANIFEST_ASSET_BASE}${name}`} />
            ))}
          </datalist>
          <ActionButton
            className="mt-2"
            icon={<UploadCloud size={13} />}
            label="submit_delivery_manifest"
            hint={gating?.canSubmitManifest ? "Assigned carrier submits the manifest before the deadline." : "Needs CARRIER_ACCEPTED status and the assigned carrier wallet."}
            disabled={busy || !gating?.canSubmitManifest}
            spinning={spinning("submit delivery manifest")}
            onClick={props.onSubmitManifest}
          />
        </div>

        <ActionButton
          icon={<Sparkles size={13} />}
          label="audit_shipment_fulfilment_live"
          hint={gating?.canAudit ? "Permissionless. Validators fetch the manifest and must agree." : "Needs MANIFEST_SUBMITTED status."}
          disabled={busy || !gating?.canAudit}
          spinning={spinning("run live audit")}
          onClick={props.onAudit}
        />

        <ActionButton
          icon={<HandCoins size={13} />}
          label="claim_shipment_settlement"
          hint={gating?.canClaim ? "Pays the vault split for the consensus band." : "Only enabled after an AUDIT_VERIFIED verdict."}
          disabled={busy || !gating?.canClaim}
          spinning={spinning("claim settlement")}
          onClick={props.onClaim}
        />
      </div>

      <div className="mt-3 rounded-lg border border-rail/50 bg-abyss/40 p-3">
        <p className="label flex items-center gap-1.5">
          <FileSignature size={12} className="text-ice" /> Propose mutual release
        </p>
        <p className="mt-1 text-[9px] leading-4 text-mist/55">
          One signature never settles. Both stored bps values must match exactly for the release to
          pay out.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Shipper bps">
            <input
              type="number"
              className={INPUT_CLASS}
              value={props.shipperBps}
              onChange={(event) => props.setShipperBps(Number(event.target.value))}
            />
          </Field>
          <Field label="Carrier bps">
            <input
              type="number"
              className={INPUT_CLASS}
              value={props.carrierBps}
              onChange={(event) => props.setCarrierBps(Number(event.target.value))}
            />
          </Field>
        </div>
        <div className="mono mt-2 grid grid-cols-2 gap-2 text-[9px] text-mist/60">
          <span>shipper_bps stored: {shipment.shipper_bps}</span>
          <span>carrier_bps stored: {shipment.carrier_bps}</span>
          <span>shipper_approved: {String(shipment.shipper_approved)}</span>
          <span>carrier_approved: {String(shipment.carrier_approved)}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionButton
            compact
            icon={<FileSignature size={12} />}
            label="sign as shipper"
            disabled={busy || !gating?.isShipper || !gating?.canMutualRelease}
            spinning={spinning("propose mutual release as shipper")}
            onClick={props.onReleaseShipper}
          />
          <ActionButton
            compact
            icon={<FileSignature size={12} />}
            label="sign as carrier"
            disabled={busy || !gating?.isCarrier || !gating?.canMutualRelease}
            spinning={spinning("propose mutual release as carrier")}
            onClick={props.onReleaseCarrier}
          />
        </div>
      </div>

      <div className="mt-3">
        <ActionButton
          icon={<TimerReset size={13} />}
          label="reclaim_expired_shipment"
          hint={gating?.reclaimBlockedReason ?? "Deadline passed with no timely manifest. Shipper recovers escrow."}
          disabled={busy || !gating || gating.reclaimBlockedReason !== null}
          spinning={spinning("reclaim expired shipment")}
          onClick={props.onReclaim}
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  disabled,
  spinning,
  onClick,
  className = "",
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  disabled: boolean;
  spinning: boolean;
  onClick: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        className={`btn w-full ${compact ? "justify-center py-1.5 text-[10px]" : "justify-start"}`}
        onClick={onClick}
        disabled={disabled}
      >
        {spinning ? <Loader2 size={compact ? 11 : 13} className="animate-spin" /> : icon}
        {label}
      </button>
      {hint && !compact ? (
        <p className={`mt-1 text-[9px] leading-4 ${disabled ? "text-mist/45" : "text-mist/60"}`}>{hint}</p>
      ) : null}
    </div>
  );
}

function TxResults({ results, onRetryRefresh }: { results: ResultEntry[]; onRetryRefresh: () => void }) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
        <p className="label">Transaction ledger</p>
        <p className="mt-2 text-[10px] text-mist/55">
          Signed transactions appear here with their explorer link and FINALIZED status.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-rail/60 bg-deck/40 p-4">
      <div className="flex items-center justify-between">
        <p className="label">Transaction ledger</p>
        <button type="button" className="btn px-2 py-1" onClick={onRetryRefresh}>
          <RefreshCw size={11} /> Refresh state
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {results.map((entry, index) => {
          const tone = entry.expectedRevert
            ? entry.executionError
              ? "border-teal/40 bg-teal/5"
              : "border-amber/40 bg-amber/5"
            : entry.accepted
              ? "border-teal/40 bg-teal/5"
              : "border-coral/40 bg-coral/5";
          return (
            <div key={`${entry.hash}-${index}`} className={`rounded-lg border ${tone} px-3 py-2`}>
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] text-white/90">{entry.label}</span>
                <span className="mono text-[9px] text-mist/70">
                  {entry.expectedRevert
                    ? entry.executionError
                      ? "GUARD HELD"
                      : "UNEXPECTED SUCCESS"
                    : entry.status}
                </span>
              </div>
              {entry.hash ? (
                <a
                  href={`${EXPLORER_URL}/transactions/${entry.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono mt-1 flex items-center gap-1 text-[9px] text-ice hover:text-white"
                >
                  {entry.hash.slice(0, 16)}...{entry.hash.slice(-8)} <ExternalLink size={9} />
                </a>
              ) : (
                <p className="mono mt-1 text-[9px] text-coral">no hash returned</p>
              )}
              {entry.executionError ? (
                <p className="mono mt-1 break-words text-[9px] leading-4 text-coral/90">
                  revert: {entry.executionError}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

