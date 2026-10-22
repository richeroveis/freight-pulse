#!/usr/bin/env python3
"""Re-verify the deployed FreightPulse identity without redeploying.

Proves the contract file, git blob, evidence hash, frontend config and README all
describe the same on-chain bytecode at the recorded address. Reads the deployed
source through the studionet RPC and hashes it. No secrets are printed.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "freight_pulse.py"
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
CONFIG_PATH = ROOT / "frontend" / "src" / "config.ts"
README_PATH = ROOT / "README.md"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    load_dotenv(ROOT / ".env")
    private_key = os.environ.get("GENLAYER_PRIVATE_KEY", "").strip()
    if not private_key:
        print("GENLAYER_PRIVATE_KEY missing from the project .env")
        return 2

    evidence = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
    address = evidence["contract_address"]

    file_sha = sha256_bytes(CONTRACT_PATH.read_bytes())
    git_sha = None
    try:
        blob = subprocess.check_output(
            ["git", "-C", str(ROOT), "show", f"HEAD:{CONTRACT_PATH.relative_to(ROOT).as_posix()}"],
            stderr=subprocess.DEVNULL,
        )
        git_sha = sha256_bytes(blob)
    except subprocess.CalledProcessError:
        git_sha = "UNCOMMITTED"

    config_text = CONFIG_PATH.read_text(encoding="utf-8")
    readme_text = README_PATH.read_text(encoding="utf-8")
    config_has_address = address in config_text
    readme_has_address = address.lower() in readme_text.lower()

    client = create_client(chain=studionet, account=create_account(private_key))
    response = client.provider.make_request("gen_getContractCode", [address])
    raw = response.get("result")
    on_chain_sha = "UNAVAILABLE"
    if isinstance(raw, str):
        encoded = raw[2:] if raw.startswith("0x") else raw
        text = None
        try:
            text = base64.b64decode(encoded).decode("utf-8")
        except Exception:
            try:
                text = bytes.fromhex(encoded).decode("utf-8")
            except Exception:
                text = None
        if text is not None:
            on_chain_sha = sha256_bytes(text.encode("utf-8"))

    evidence_sha = evidence["four_way_sha256"]["contract_file_sha256"]

    digests = {
        "contract_file_sha256": file_sha,
        "git_blob_sha256": git_sha,
        "evidence_sha256": evidence_sha,
        "on_chain_code_sha256": on_chain_sha,
    }
    print(json.dumps(
        {
            "address": address,
            "config_has_address": config_has_address,
            "readme_has_address": readme_has_address,
            "digests": digests,
        },
        indent=2,
    ))

    comparable = {file_sha, git_sha, evidence_sha, on_chain_sha}
    identity_ok = len(comparable) == 1 and "UNAVAILABLE" not in comparable and "UNCOMMITTED" not in comparable
    if not identity_ok:
        print("IDENTITY CHECK: FAIL (a digest differs or is unavailable)")
        return 1
    if not (config_has_address and readme_has_address):
        print("IDENTITY CHECK: FAIL (address not present in config or README)")
        return 1
    print("IDENTITY CHECK: PASS (deployed bytes, file, git blob and evidence all match)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
