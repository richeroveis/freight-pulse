#!/usr/bin/env python3
"""Render docs/evidence.md from the committed studionet evidence JSON."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "studionet_deployment.json"
OUT = ROOT / "docs" / "evidence.md"
EXPLORER = "https://explorer-studio.genlayer.com"


def fpt(base_units: int) -> str:
    return f"{round(base_units / 1_000_000):,} FPT"


def tx_link(tx_hash: str) -> str:
    if not tx_hash:
        return "-"
    return f"[{tx_hash[:12]}...]({EXPLORER}/transactions/{tx_hash})"


def main() -> None:
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    four = data.get("four_way_sha256", {})
    verification = data.get("verification", {})
    invariants = verification.get("invariants", {})
    shipments = verification.get("shipments", [])
    balances = verification.get("balances", {})
    transactions = data.get("transactions", [])
    guards = data.get("guard_reverts", [])
    rpc = data.get("rpc_pacing", {})

    lines = [
        "# FreightPulse studionet evidence",
        "",
        "Every row below is a studionet transaction that was polled to `FINALIZED` and read back",
        "through the consensus data contract. The legacy explorer host was unavailable during the",
        "run; the newer explorer frontend was reachable, but its JSON endpoint was not documented,",
        "so the RPC receipt is the source of truth and the explorer links are provided for humans.",
        "",
        "## Deployment",
        "",
        f"- Network: `{data.get('network')}` chain id `{data.get('chain_id')}`",
        f"- RPC: `{data.get('rpc')}`",
        f"- Contract: `{data.get('contract_address')}`",
        f"- Deploy transaction: {tx_link(data.get('deploy_tx_hash', ''))}",
        f"- Git HEAD: `{data.get('git_head', '')}`",
        f"- Main signer: `{data.get('main_signer', '')}`",
        f"- Burner signers: {len(data.get('burner_accounts', {}))}",
        f"- Generated at: `{data.get('generated_at', '')}`",
        f"- RPC pacing: {rpc.get('min_interval_seconds', '')}s between calls, "
        f"{rpc.get('rate_limit_retries', 0)} rate limit retries, "
        f"{rpc.get('transient_retries', 0)} transient retries",
        "",
        "## 4-way sha256 identity",
        "",
        "| Source | sha256 |",
        "| --- | --- |",
        f"| Local contract file | `{four.get('contract_file_sha256', '')}` |",
        f"| Git blob at HEAD | `{four.get('git_blob_sha256', '')}` |",
        f"| Deploy payload | `{four.get('deploy_payload_sha256', '')}` |",
        f"| On-chain source | `{four.get('on_chain_code_sha256', '')}` |",
        "",
        f"All four match: **{'YES' if four.get('all_match') else 'NO'}**.",
        "",
        "The on-chain source was decoded from `gen_getContractCode` and hashed as UTF-8 text.",
        "The deploy payload was decoded from the base64 `contract_code` field of the deploy",
        "transaction receipt.",
        "",
        "## Transactions",
        "",
        "| # | Action | Transaction | Status | Execution | Consensus |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for index, record in enumerate(transactions, start=1):
        lines.append(
            f"| {index} | {record.get('label', '')} | {tx_link(record.get('tx_hash', ''))} | "
            f"{record.get('status', '')} | {record.get('execution_result', '')} | "
            f"{record.get('consensus_result', '')} |"
        )

    lines += [
        "",
        "## Expected guard reverts",
        "",
        "| Probe | Transaction | Revert payload |",
        "| --- | --- | --- |",
    ]
    for record in guards:
        payload = str(record.get("execution_payload", "")).replace("|", "\\|")
        lines.append(
            f"| {record.get('label', '')} | {tx_link(record.get('tx_hash', ''))} | `{payload}` |"
        )

    lines += [
        "",
        "## Final state",
        "",
        f"- Vault custody: `{fpt(invariants.get('vault_custody_balance', 0))}`",
        f"- Locked escrow: `{fpt(invariants.get('locked_escrow', 0))}`",
        f"- Sum of token balances: `{fpt(invariants.get('sum_token_balances', 0))}`",
        f"- Total supply: `{fpt(invariants.get('total_supply', 0))}`",
        f"- Vault equals escrow: **{invariants.get('vault_matches_escrow')}**",
        f"- Supply equals balances plus vault: **{invariants.get('supply_matches_balances_plus_vault')}**",
        f"- Every settled band conserves fee plus bond: **{invariants.get('settled_conservation_ok')}**",
        f"- Combined invariant: **{'PASS' if invariants.get('conserved') else 'FAIL'}**",
        "",
        "### Shipments",
        "",
        "| # | Bill of lading | Route | Status | Band | Fee | Bond | Carrier | Shipper |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for shipment in shipments:
        lines.append(
            f"| {shipment.get('shipment_id')} | {shipment.get('bill_of_lading_id')} | "
            f"{shipment.get('route')} | {shipment.get('status')} | {shipment.get('fulfilment_band')} | "
            f"`{fpt(shipment.get('freight_fee', 0))}` | `{fpt(shipment.get('required_carrier_bond', 0))}` | "
            f"`{fpt(shipment.get('carrier_payout', 0))}` | `{fpt(shipment.get('shipper_refund', 0))}` |"
        )

    lines += [
        "",
        "### Signer balances",
        "",
        "| Role | Address | FPT | GEN wei |",
        "| --- | --- | --- | --- |",
    ]
    for role, row in balances.items():
        lines.append(
            f"| {role} | `{row.get('address', '')}` | `{fpt(row.get('fpt', 0))}` | `{row.get('gen', '')}` |"
        )

    lines += [
        "",
        "## Notes",
        "",
        "- The direct mode suite covers the same bands, conservation checks, mutual release and",
        "  reclaim boundaries without a server. See `tests/test_freight_pulse_direct.py`.",
        "- The live audits exercise validator agreement, real web rendering and the model call. The",
        "  deterministic manifest parser is the settlement source; the model must agree with its",
        "  outcome before the band is written.",
        "- Explorer links use `explorer-studio.genlayer.com`. The deployment was verified through the",
        "  RPC consensus data contract because the legacy explorer JSON host was paused.",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(transactions)} transactions, {len(guards)} reverts)")


if __name__ == "__main__":
    main()
