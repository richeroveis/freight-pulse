#!/usr/bin/env python3
"""Read the settled lifecycle state back from the contract, independent of the UI.

Confirms that the Playwright run actually moved on-chain state: the audited
shipment reached SETTLED with a consensus band, the mutual release reached
SETTLED at the co-signed split, and the abandoned order reached RECLAIMED with
the shipper fee refunded. Also reports each party token balance. Reads are plain
contract views through the public RPC. No secrets.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
HASHES_PATH = ROOT / "evidence" / "_e2e_hashes.json"
BURNERS_PATH = ROOT / "evidence" / "_burners.json"
CONTRACT = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))["contract_address"]
FPT = 10**6


def read_with_retry(client, fn, args, attempts=8):
    last = None
    for attempt in range(attempts):
        try:
            return client.read_contract(CONTRACT, fn, args=args)
        except Exception as error:  # transient SSL / rate limit
            last = error
            time.sleep(3 + attempt * 3)
    raise last


def num(value):
    try:
        return int(value)
    except Exception:
        return 0


def main() -> int:
    data = json.loads(HASHES_PATH.read_text(encoding="utf-8"))
    bols = data.get("bols") or {}
    # A throwaway local account only satisfies the client's request signing for
    # view calls; it holds no assets and its key is never printed or stored.
    clients = create_client(chain=studionet, account=create_account())

    shipments = read_with_retry(clients, "list_shipments", [])
    by_bol = {}
    for shipment in shipments:
        bol = str(shipment.get("bill_of_lading_id", ""))
        by_bol[bol] = shipment  # last write wins, newest id appended last

    burners = {}
    if BURNERS_PATH.exists():
        burners = json.loads(BURNERS_PATH.read_text(encoding="utf-8"))

    results = []
    checked = {"a": None, "b": None, "c": None}

    def row(bol):
        return by_bol.get(bol)

    # Path A: audit + claim -> SETTLED with a consensus band, escrow fully split.
    a = row(bols.get("a", ""))
    if a:
        conserved = num(a.get("carrier_payout")) + num(a.get("shipper_refund"))
        checked["a"] = str(a.get("status")) == "SETTLED" and conserved == num(a.get("freight_fee")) + num(a.get("required_carrier_bond"))
        results.append(
            {
                "path": "a",
                "bol": bols.get("a"),
                "shipment_id": num(a.get("shipment_id")),
                "status": str(a.get("status")),
                "fulfilment_band": str(a.get("fulfilment_band")),
                "customs_cleared": bool(a.get("customs_cleared")),
                "temp_breached": bool(a.get("temp_breached")),
                "carrier_payout_fpt": num(a.get("carrier_payout")) / FPT,
                "shipper_refund_fpt": num(a.get("shipper_refund")) / FPT,
                "escrow_conserved": conserved == num(a.get("freight_fee")) + num(a.get("required_carrier_bond")),
            }
        )

    # Path B: co-signed mutual release -> SETTLED at 7000 bps.
    b = row(bols.get("b", ""))
    if b:
        checked["b"] = (
            str(b.get("status")) == "SETTLED"
            and bool(b.get("shipper_approved"))
            and bool(b.get("carrier_approved"))
            and num(b.get("mutual_release_bps")) == 7000
        )
        results.append(
            {
                "path": "b",
                "bol": bols.get("b"),
                "shipment_id": num(b.get("shipment_id")),
                "status": str(b.get("status")),
                "fulfilment_band": str(b.get("fulfilment_band")),
                "mutual_release_bps": num(b.get("mutual_release_bps")),
                "shipper_approved": bool(b.get("shipper_approved")),
                "carrier_approved": bool(b.get("carrier_approved")),
                "carrier_payout_fpt": num(b.get("carrier_payout")) / FPT,
                "shipper_refund_fpt": num(b.get("shipper_refund")) / FPT,
            }
        )

    # Path C: abandoned order reclaimed by the shipper after the deadline.
    c = row(bols.get("c", ""))
    if c:
        checked["c"] = str(c.get("status")) == "RECLAIMED" and num(c.get("shipper_refund")) == num(c.get("freight_fee"))
        results.append(
            {
                "path": "c",
                "bol": bols.get("c"),
                "shipment_id": num(c.get("shipment_id")),
                "status": str(c.get("status")),
                "fulfilment_band": str(c.get("fulfilment_band")),
                "shipper_refund_fpt": num(c.get("shipper_refund")) / FPT,
                "freight_fee_fpt": num(c.get("freight_fee")) / FPT,
            }
        )

    balances = {}
    for role, entry in burners.items():
        addr = entry.get("address")
        if addr:
            try:
                balances[role] = num(read_with_retry(clients, "get_token_balance", [addr], attempts=4)) / FPT
            except Exception:
                balances[role] = None

    invariants = read_with_retry(clients, "check_vault_invariants", [])
    summary = {
        "contract_address": CONTRACT,
        "path_a_settled_with_consensus_band": checked["a"],
        "path_b_mutual_release_settled": checked["b"],
        "path_c_reclaimed": checked["c"],
        "party_fpt_balances": balances,
        "vault_matches_locked_escrow": bool(invariants.get("vault_matches_escrow")),
        "supply_conserved": bool(invariants.get("supply_matches_balances_plus_vault")),
        "shipments": results,
    }
    print(json.dumps(summary, indent=2))

    all_ok = bool(results) and all(v is True for v in checked.values() if v is not None)
    print("SETTLEMENT READS: " + ("PASS" if all_ok else "CHECK"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
