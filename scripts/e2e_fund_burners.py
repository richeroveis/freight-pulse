#!/usr/bin/env python3
"""Create and fund the named burner wallets the browser flow needs.

Roles: shipper and carrier. Each is given native GEN for gas with a legacy
value transfer from the main account, and the FPT test credit is claimed later
through the UI faucet so the run exercises the real write path. Private keys are
written to a gitignored JSON file for the Playwright driver to read. They are
never printed to stdout, logs or commits.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "evidence" / "_burners.json"
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
FPT = 10**6
GEN = 10**18
CHAIN_ID = 61999
MIN_RPC_INTERVAL = 2.8
ROLES = ("shipper", "carrier")
GEN_PER_ROLE = 3


def paced(last: float) -> float:
    delay = last + MIN_RPC_INTERVAL - time.time()
    if delay > 0:
        time.sleep(delay)
    return time.time()


def safe_balance(client, address: str) -> int:
    """Read a GEN balance with retry, since studionet occasionally drops a
    keep-alive connection with a transient SSL EOF."""
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            return int(client.get_balance(address))
        except Exception as error:  # transient network / SSL failure
            last_error = error
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"balance read failed for {address}: {last_error}")


def main() -> int:
    load_dotenv(ROOT / ".env")
    contract = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))["contract_address"]
    private_key = os.environ.get("GENLAYER_PRIVATE_KEY", "").strip()
    if not private_key:
        print("GENLAYER_PRIVATE_KEY missing")
        return 2

    main_account = create_account(private_key)
    client = create_client(chain=studionet, account=main_account)
    w3 = client.w3

    main_gen = safe_balance(client, main_account.address)
    print(f"[fund] main GEN balance {main_gen // GEN} GEN", flush=True)
    if main_gen < (GEN_PER_ROLE * len(ROLES) * GEN) // 2:
        print("[fund] FAILED main wallet is low on GEN to fund the burners")
        return 1

    # Reuse any already-created roles so repeated runs keep funded wallets, and
    # only mint + top up the ones that are missing.
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    record = dict(existing)
    for role in ROLES:
        if role in record and record[role].get("key"):
            addr = record[role]["address"]
            gen = safe_balance(client, addr)
            print(f"[fund] {role} reused {addr} GEN={gen // GEN}", flush=True)
            if gen >= GEN:
                continue
        burner = create_account()
        key = burner.key.hex() if hasattr(burner.key, "hex") else str(burner.key)
        if not key.startswith("0x"):
            key = "0x" + key
        record[role] = {"role": role, "address": burner.address, "key": key}
        last = paced(0.0)
        nonce = w3.eth.get_transaction_count(main_account.address)
        signed = main_account.sign_transaction(
            {
                "to": burner.address,
                "value": GEN_PER_ROLE * GEN,
                "gas": 21000,
                "gasPrice": 0,
                "nonce": nonce,
                "chainId": CHAIN_ID,
                "data": b"",
            }
        )
        fund_hash = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
        print(f"[fund] {role} <- {GEN_PER_ROLE} GEN tx {fund_hash}", flush=True)
        for _ in range(60):
            last = paced(last)
            try:
                if safe_balance(client, burner.address) >= GEN:
                    break
            except RuntimeError:
                pass
            time.sleep(3)
        gen = safe_balance(client, burner.address)
        print(f"[fund] {role} address {burner.address} GEN={gen}", flush=True)
        if gen < GEN:
            print(f"[fund] FAILED {role} not funded")
            return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(record, indent=2), encoding="utf-8")
    os.chmod(OUT_PATH, 0o600)
    print("[fund] wrote " + str(OUT_PATH.relative_to(ROOT)) + " for roles: " + ", ".join(record))
    print("FUND BURNERS: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
