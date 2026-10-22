#!/usr/bin/env python3
"""Verify the Playwright-driven UI transactions through the explorer JSON API.

Reads evidence/_e2e_hashes.json (the hashes the browser signed), fetches each
transaction from the studionet explorer JSON API, confirms FINALIZED status and
the expected leader execution result, and proves the created shipment landed on
chain. Writes the committed evidence/ui_flow_verification.json. No secrets.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HASHES_PATH = ROOT / "evidence" / "_e2e_hashes.json"
OUT_PATH = ROOT / "evidence" / "ui_flow_verification.json"
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
EXPLORER_API = "https://explorer-studio.genlayer.com/api/transactions/"
CONTRACT = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))["contract_address"]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def explorer_tx(tx_hash: str) -> dict:
    last_error = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(
                EXPLORER_API + tx_hash,
                headers={"User-Agent": "freight-pulse-verify", "Accept": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return payload.get("transaction") or {}
        except Exception as error:  # noqa: BLE001 - transient gateway and rate limits
            last_error = error
            time.sleep(4 + attempt * 4)
    raise last_error


def leader_view(transaction: dict) -> dict:
    consensus = transaction.get("consensus_data") or {}
    receipts = consensus.get("leader_receipt") or []
    leader = receipts[0] if isinstance(receipts, list) and receipts else (receipts or {})
    raw_result = leader.get("result")
    decoded = ""
    if isinstance(raw_result, str) and raw_result:
        try:
            import base64

            decoded = base64.b64decode(raw_result).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            decoded = ""
    return {
        "execution_result": leader.get("execution_result"),
        "result_text": decoded,
    }


def verify_hash(tx_hash: str, expect: str) -> dict:
    info = {"tx_hash": tx_hash, "explorer_url": "https://explorer-studio.genlayer.com/transactions/" + tx_hash}
    try:
        transaction = explorer_tx(tx_hash)
    except Exception as error:  # noqa: BLE001
        info["error"] = str(error)
        info["ok"] = False
        return info
    leader = leader_view(transaction)
    status = transaction.get("status")
    info["status"] = status
    info["from_address"] = transaction.get("from_address")
    info["to_address"] = transaction.get("to_address")
    info["leader_execution_result"] = leader["execution_result"]
    info["leader_result_text"] = leader["result_text"][:200]
    if expect == "return":
        info["ok"] = status == "FINALIZED" and leader["execution_result"] == "SUCCESS"
    else:  # revert
        info["ok"] = status == "FINALIZED" and leader["execution_result"] == "ERROR"
    return info


def main() -> int:
    if not HASHES_PATH.exists():
        print("missing evidence/_e2e_hashes.json; run the Playwright flow first")
        return 2
    hashes = json.loads(HASHES_PATH.read_text(encoding="utf-8"))

    records = []
    for label, bucket, expect in [
        ("faucet_or_deposit", "faucet_hashes", "return"),
        ("create_shipment_order", "create_hashes", "return"),
        ("guard probe submit_delivery_manifest", "guard_probe_hashes", "revert"),
    ]:
        for tx_hash in hashes.get(bucket, []):
            print(f"[verify] {label} {tx_hash[:16]}...")
            info = verify_hash(tx_hash, expect)
            info["method"] = label
            info["expected"] = expect
            records.append(info)
            time.sleep(1.5)

    all_ok = bool(records) and all(record.get("ok") for record in records)
    evidence = {
        "project": "FreightPulse",
        "network": "studionet",
        "chain_id": 61999,
        "contract_address": CONTRACT,
        "source": "Playwright driven frontend, burner wallet mode",
        "app_url_under_test": hashes.get("app_url"),
        "explorer_json_api": EXPLORER_API,
        "verification_basis": (
            "Every hash below was signed by the browser through writeContract and is read back "
            "from the studionet explorer JSON API. Lifecycle writes must finalize with the leader "
            "returning; the guard probe must finalize with the leader reverting."
        ),
        "transactions": records,
        "all_expected": all_ok,
        "generated_at": now_iso(),
    }
    OUT_PATH.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"records": len(records), "all_expected": all_ok}, indent=2))
    if not all_ok:
        print("UI FLOW VERIFICATION: FAIL")
        return 1
    print(f"UI FLOW VERIFICATION: PASS ({len(records)} transactions verified via explorer JSON API)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
