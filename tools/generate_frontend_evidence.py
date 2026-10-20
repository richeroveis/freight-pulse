#!/usr/bin/env python3
"""Regenerate the frontend snapshot and evidence constants from the committed evidence JSON."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
SNAPSHOT_PATH = ROOT / "frontend" / "src" / "data" / "snapshot.ts"
EVIDENCE_TS_PATH = ROOT / "frontend" / "src" / "data" / "evidence.ts"

GUARD_IDS = {
    "guard unilateral mutual release": "unilateral-release",
    "guard premature reclaim after manifest": "premature-reclaim",
    "guard untrusted manifest URL": "untrusted-url",
    "guard claim before live audit": "premature-reclaim",
}

SHIPMENT_KEYS = {
    "gva_sin_biologics": "gva_sin",
    "rtm_tyo_photoresist": "rtm_tyo",
    "osl_nyc_seafood": "osl_nyc",
    "lax_bcn_aerospace": "lax_bcn",
    "gva_dxb_mutual": "gva_dxb",
    "sin_ham_abandoned": "sin_ham",
}


def load() -> dict:
    return json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))


def evidence_ts(data: dict) -> str:
    four = data.get("four_way_sha256", {})
    guard_rows = []
    seen = set()
    for record in data.get("guard_reverts", []):
        probe = GUARD_IDS.get(record.get("label", ""))
        if probe is None or probe in seen:
            continue
        seen.add(probe)
        guard_rows.append(
            {
                "id": probe,
                "label": record.get("label", ""),
                "rule": {
                    "unilateral-release": "propose_mutual_release requires shipper and carrier, and both stored bps must match.",
                    "premature-reclaim": "reclaim_expired_shipment is blocked while status is MANIFEST_SUBMITTED.",
                    "untrusted-url": "submit_delivery_manifest accepts only public HTTPS document URLs.",
                }[probe],
                "revertReason": record.get("execution_payload", ""),
                "txHash": record.get("tx_hash", ""),
                "status": record.get("status", ""),
            }
        )
    while len(guard_rows) < 3:
        fallback = [
            ("unilateral-release", "Unilateral mutual release"),
            ("premature-reclaim", "Post-manifest premature reclaim"),
            ("untrusted-url", "Untrusted manifest URL"),
        ][len(guard_rows)]
        guard_rows.append(
            {
                "id": fallback[0],
                "label": fallback[1],
                "rule": "",
                "revertReason": "",
                "txHash": "",
                "status": "pending",
            }
        )

    labels_by_tx = {}
    for record in data.get("transactions", []):
        labels_by_tx[record.get("label", "")] = record.get("tx_hash", "")

    audit_map = {}
    claim_map = {}
    for key, shipment_id in data.get("shipment_ids", {}).items():
        short = SHIPMENT_KEYS.get(key)
        if short:
            audit_map[int(shipment_id)] = labels_by_tx.get(f"audit {short}", "")
            claim_map[int(shipment_id)] = labels_by_tx.get(f"claim {short}", "")

    lines = [
        'import type { ProbeId } from "../types";',
        "",
        "export interface GuardEvidence {",
        "  id: ProbeId;",
        "  label: string;",
        "  rule: string;",
        "  revertReason: string;",
        "  txHash: string;",
        "  status: string;",
        "}",
        "",
        "export const GUARD_EVIDENCE: GuardEvidence[] = " + json.dumps(guard_rows, indent=2) + ";",
        "",
        f'export const DEPLOY_TX_HASH = "{data.get("deploy_tx_hash", "")}";',
        "",
        "export const FOUR_WAY = {",
        f'  contractFile: "{four.get("contract_file_sha256", "")}",',
        f'  gitBlob: "{four.get("git_blob_sha256", "")}",',
        f'  deployPayload: "{four.get("deploy_payload_sha256", "")}",',
        f'  onChain: "{four.get("on_chain_code_sha256", "")}",',
        f'  allMatch: {"true" if four.get("all_match") else "false"},',
        "};",
        "",
        "export const AUDIT_TX_BY_SHIPMENT: Record<number, string> = " + json.dumps(audit_map, indent=2) + ";",
        "",
        "export const CLAIM_TX_BY_SHIPMENT: Record<number, string> = " + json.dumps(claim_map, indent=2) + ";",
        "",
    ]
    return "\n".join(lines)


def snapshot_ts(data: dict) -> str:
    verification = data.get("verification", {})
    metadata = verification.get("token_metadata", {})
    invariants = verification.get("invariants", {})
    shipments = verification.get("shipments", [])
    generated = data.get("generated_at", "2026-10-20T00:00:00Z")
    try:
        chain_time = int(datetime.fromisoformat(generated.replace("Z", "+00:00")).timestamp())
    except ValueError:
        chain_time = 0
    snapshot = {
        "source": "snapshot",
        "chainTime": chain_time,
        "metadata": metadata,
        "invariants": invariants,
        "shipments": shipments,
    }
    lines = [
        'import type { DashboardData } from "../types";',
        "",
        "// Regenerated by tools/generate_frontend_evidence.py from the committed evidence JSON.",
        f"export const SNAPSHOT: DashboardData = {json.dumps(snapshot, indent=2)};",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    data = load()
    if not data.get("verification"):
        raise SystemExit("evidence file has no verification section yet")
    SNAPSHOT_PATH.write_text(snapshot_ts(data), encoding="utf-8")
    EVIDENCE_TS_PATH.write_text(evidence_ts(data), encoding="utf-8")
    print(f"wrote {SNAPSHOT_PATH.relative_to(ROOT)} and {EVIDENCE_TS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
