#!/usr/bin/env python3
"""Create and fund a burner, then smoke test one real contract write.

This proves a browser-side burner session can pay gas and finalize a lifecycle
transaction on studionet before Playwright drives the UI. The private key is
written to a gitignored file for the browser driver to read. The key is never
printed to stdout or logs.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parents[1]
KEY_PATH = ROOT / "evidence" / "_e2e_key.txt"
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
FPT = 10**6
CHAIN_ID = 61999
MIN_RPC_INTERVAL = 2.8


def paced(last):
    wait = last + MIN_RPC_INTERVAL - time.time()
    if wait > 0:
        time.sleep(wait)
    return time.time()


def wait_final(client, tx_hash, timeout=600):
    deadline = time.time() + timeout
    last = 0.0
    while time.time() < deadline:
        last = paced(last)
        try:
            info = client.get_transaction(tx_hash)
        except Exception:
            time.sleep(4)
            continue
        status = str(info.get("status_name") or info.get("status") or "")
        if status == "FINALIZED":
            return info
        if status in ("CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"):
            raise RuntimeError(f"tx {tx_hash} ended as {status}")
        time.sleep(4)
    raise TimeoutError(f"tx {tx_hash} not finalized within {timeout}s")


def main() -> int:
    load_dotenv(ROOT / ".env")
    import json

    address = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))["contract_address"]
    private_key = os.environ.get("GENLAYER_PRIVATE_KEY", "").strip()
    if not private_key:
        print("GENLAYER_PRIVATE_KEY missing")
        return 2

    main_account = create_account(private_key)
    client = create_client(chain=studionet, account=main_account)
    w3 = client.w3

    burner = create_account()
    KEY_PATH.write_text(burner.key.hex() if hasattr(burner.key, "hex") else str(burner.key), encoding="utf-8")
    os.chmod(KEY_PATH, 0o600)
    print(f"[fund] burner address {burner.address}", flush=True)
    print(f"[fund] contract {address}", flush=True)

    # Fund the burner with native GEN for gas via a legacy value transfer.
    last = 0.0
    last = paced(last)
    nonce = w3.eth.get_transaction_count(main_account.address)
    value = 3 * 10**18
    signed = main_account.sign_transaction(
        {
            "to": burner.address,
            "value": value,
            "gas": 21000,
            "gasPrice": 0,
            "nonce": nonce,
            "chainId": CHAIN_ID,
            "data": b"",
        }
    )
    fund_hash = w3.eth.send_raw_transaction(signed.raw_transaction).hex()
    print(f"[fund] GEN transfer tx {fund_hash}", flush=True)
    for _ in range(60):
        last = paced(last)
        if client.get_balance(burner.address) >= 10**18:
            break
        time.sleep(3)
    gen_balance = client.get_balance(burner.address)
    print(f"[fund] burner GEN balance {gen_balance}", flush=True)
    if gen_balance < 10**18:
        print("[fund] FAILED burner not funded")
        return 1

    # Smoke test one real write: fund FPT through the contract faucet.
    burner_client = create_client(chain=studionet, account=burner)
    last = paced(last)
    tx_hash = burner_client.write_contract(
        address, "faucet_or_deposit", account=burner, args=[100_000 * FPT]
    )
    tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
    print(f"[smoke] faucet tx {tx_hash}", flush=True)
    wait_final(burner_client, tx_hash)
    last = paced(last)
    fpt = int(burner_client.read_contract(address, "get_token_balance", args=[burner.address]))
    print(f"[smoke] burner FPT balance {fpt}", flush=True)
    if fpt < 100_000 * FPT:
        print("[smoke] FAILED faucet write did not credit")
        return 1

    print("SMOKE TEST: PASS (burner funded and finalized a real contract write)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
