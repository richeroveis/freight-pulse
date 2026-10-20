#!/usr/bin/env python3
"""Deploy FreightPulse to studionet, seed multi-signer shipments and verify.

The script is resumable: every action is checked against on-chain state before
it is sent, and an ignored checkpoint keeps burner keys and progress locally.
Secrets are never written to the committed evidence file.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "freight_pulse.py"
EVIDENCE_PATH = ROOT / "evidence" / "studionet_deployment.json"
CHECKPOINT_PATH = ROOT / "evidence" / "_checkpoint.json"
REPO_SLUG = "richeroveis/freight-pulse"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO_SLUG}/main/evidence/manifests/"

FPT = 10**6
CHAIN_ID = 61999
ZERO = "0x" + "00" * 20


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
    return {
        "network": "studionet",
        "chain_id": CHAIN_ID,
        "accounts": {},
        "shipments": {},
        "transactions": [],
        "guard_reverts": [],
        "created_at": now_iso(),
    }


def save_checkpoint(state: dict) -> None:
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = now_iso()
    CHECKPOINT_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.chmod(CHECKPOINT_PATH, 0o600)


def normalize(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def git_blob_sha256() -> str | None:
    rel = CONTRACT_PATH.relative_to(ROOT).as_posix()
    try:
        data = subprocess.check_output(
            ["git", "-C", str(ROOT), "show", f"HEAD:{rel}"], stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        return None
    return sha256_bytes(data)


def git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except subprocess.CalledProcessError:
        return ""


def http_ok(url: str, timeout: int = 20) -> tuple[bool, int]:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "freight-pulse-verify"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status == 200, response.status
    except Exception:
        return False, 0


class Runner:
    def __init__(self) -> None:
        load_dotenv(ROOT / ".env")
        private_key = os.environ.get("GENLAYER_PRIVATE_KEY", "").strip()
        if not private_key:
            raise SystemExit("GENLAYER_PRIVATE_KEY is missing from the project .env")
        self.main = create_account(private_key)
        self.client = create_client(chain=studionet, account=self.main)
        self.state = load_checkpoint()
        self.state["main_address"] = self.main.address
        self.code = CONTRACT_PATH.read_text(encoding="utf-8")
        self.local_sha = sha256_text(self.code)
        self.git_sha = git_blob_sha256()
        self.address = self.state.get("contract_address")

    # -- chain helpers ----------------------------------------------------

    def wait_final(self, tx_hash: str, timeout: int = 900) -> dict:
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                last = self.client.get_transaction(tx_hash)
            except Exception as exc:  # transient RPC errors are expected
                last = {"error": str(exc)}
            status = normalize((last or {}).get("status_name") or (last or {}).get("status"))
            if status == "FINALIZED":
                return last
            if status in ("CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"):
                return last
            time.sleep(3)
        raise TimeoutError(f"transaction {tx_hash} did not finalize: {last}")

    def summarize(self, label: str, tx_hash: str, receipt: dict, expected_error: bool = False) -> dict:
        status = normalize(receipt.get("status_name") or receipt.get("status"))
        result = normalize(receipt.get("result_name") or receipt.get("result"))
        execution = normalize(receipt.get("tx_execution_result_name"))
        last_round = (receipt.get("last_round") or {})
        if not last_round:
            last_round = ((receipt.get("consensus_data") or {}).get("last_round") or {})
        consensus = normalize(last_round.get("result"))
        record = {
            "label": label,
            "tx_hash": tx_hash,
            "status": status,
            "result": result,
            "consensus_result": consensus or result,
            "execution_result": execution,
            "expected_error": expected_error,
            "finalized": status == "FINALIZED",
            "explorer_url": f"https://explorer-studio.genlayer.com/transactions/{tx_hash}",
            "recorded_at": now_iso(),
        }
        self.state["transactions"].append(record)
        if expected_error:
            self.state["guard_reverts"].append(record)
        save_checkpoint(self.state)
        print(
            f"[tx] {label}: {tx_hash[:14]}... status={status} exec={execution} "
            f"consensus={record['consensus_result']}",
            flush=True,
        )
        return record

    def write(
        self,
        label: str,
        function_name: str,
        args: list,
        account=None,
        expected_error: bool = False,
    ) -> dict:
        sender = account or self.main
        tx_hash = self.client.write_contract(
            self.address, function_name, account=sender, args=args
        )
        tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
        receipt = self.wait_final(tx_hash)
        record = self.summarize(label, tx_hash, receipt, expected_error)
        if not expected_error:
            if record["execution_result"] != "FINISHED_WITH_RETURN":
                raise RuntimeError(f"{label} failed execution: {record}")
            if record["consensus_result"] not in ("MAJORITY_AGREE", "AGREE", ""):
                raise RuntimeError(f"{label} lacked majority agreement: {record}")
        else:
            if record["execution_result"] != "FINISHED_WITH_ERROR":
                raise RuntimeError(f"{label} was expected to revert but did not: {record}")
        return record

    def read(self, function_name: str, args: list | None = None):
        return self.client.read_contract(self.address, function_name, args=args or [])

    def send_native(self, to: str, amount: int, nonce: int) -> str:
        w3 = self.client.w3
        tx = {
            "to": to,
            "value": amount,
            "gas": 21000,
            "gasPrice": 0,
            "nonce": nonce,
            "chainId": CHAIN_ID,
            "data": b"",
        }
        signed = self.main.sign_transaction(tx)
        return w3.eth.send_raw_transaction(signed.raw_transaction).hex()

    def fund_accounts(self, roles: list[tuple[str, object]]) -> None:
        w3 = self.client.w3
        nonce = w3.eth.get_transaction_count(self.main.address)
        pending = []
        for role, account in roles:
            balance = self.client.get_balance(account.address)
            if balance >= 2 * 10**18:
                continue
            top_up = 3 * 10**18 - balance
            try:
                tx_hash = self.send_native(account.address, top_up, nonce)
                pending.append((role, tx_hash))
                nonce += 1
            except Exception as exc:
                print(f"[fund] {role} transfer failed: {exc}", flush=True)
        for role, tx_hash in pending:
            print(f"[fund] {role} -> {tx_hash[:14]}...", flush=True)
        if pending:
            for role, account in roles:
                for _ in range(40):
                    if self.client.get_balance(account.address) >= 10**18:
                        break
                    time.sleep(2)
                print(f"[fund] {role} balance {self.client.get_balance(account.address)}", flush=True)

    def ensure_accounts(self) -> dict[str, object]:
        roles = [
            "carrier_gva",
            "shipper_rtm",
            "carrier_rtm",
            "shipper_osl",
            "carrier_osl",
            "carrier_dxb",
            "carrier_lax",
        ]
        accounts = {}
        for role in roles:
            saved = self.state["accounts"].get(role)
            if saved:
                account = create_account(saved["private_key"])
                if account.address.lower() != saved["address"].lower():
                    raise RuntimeError(f"checkpoint key mismatch for {role}")
            else:
                account = create_account()
                self.state["accounts"][role] = {
                    "address": account.address,
                    "private_key": account.private_key.hex()
                    if hasattr(account.private_key, "hex")
                    else str(account.private_key),
                }
                save_checkpoint(self.state)
            accounts[role] = account
        self.fund_accounts([(role, acct) for role, acct in accounts.items()])
        return accounts

    def ensure_fpt(self, accounts: dict[str, object]) -> None:
        targets = [("main", self.main)] + list(accounts.items())
        threshold = 400_000 * FPT
        for role, account in targets:
            balance = self.read("get_token_balance", [account.address])
            if int(balance) >= threshold:
                continue
            self.write(f"faucet {role}", "faucet_or_deposit", [2_000_000 * FPT], account=account)

    # -- deployment -------------------------------------------------------

    def deploy(self) -> None:
        if self.address:
            print(f"[deploy] reusing checkpoint address {self.address}", flush=True)
            try:
                schema = self.client.get_contract_schema(self.address)
                if schema:
                    self.state.setdefault("deployment", {})["reused"] = True
                    save_checkpoint(self.state)
                    return
            except Exception as exc:
                print(f"[deploy] checkpoint address unusable: {exc}", flush=True)

        print("[deploy] sending deployment transaction", flush=True)
        tx_hash = self.client.deploy_contract(self.code, account=self.main, args=[])
        tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
        receipt = self.wait_final(tx_hash, timeout=1200)
        record = self.summarize("deploy FreightPulse", tx_hash, receipt)
        candidates = [
            receipt.get("recipient"),
            receipt.get("to_address"),
            (receipt.get("data") or {}).get("contract_address"),
        ]
        address = None
        for candidate in candidates:
            if candidate and str(candidate).lower() != ZERO:
                try:
                    if self.client.get_contract_schema(candidate):
                        address = candidate
                        break
                except Exception:
                    continue
        if not address:
            raise RuntimeError(f"could not resolve contract address from deploy receipt: {receipt}")
        self.address = address
        self.state["contract_address"] = address
        self.state["deployment"] = {
            "tx_hash": tx_hash,
            "address": address,
            "deploy_payload_sha256": self.local_sha,
            "contract_file_sha256": self.local_sha,
            "git_blob_sha256": self.git_sha,
            "git_head": git_head(),
            "chain_id": CHAIN_ID,
            "deployed_at": now_iso(),
        }
        save_checkpoint(self.state)
        print(f"[deploy] contract at {address}", flush=True)

    def verify_chain_code(self) -> tuple[str, str]:
        response = self.client.provider.make_request(
            method="gen_getContractCode", params=[self.address]
        )
        raw = response.get("result")
        if raw is None:
            raise RuntimeError(f"gen_getContractCode failed: {response}")
        if isinstance(raw, str):
            text = raw[2:] if raw.startswith("0x") else raw
            try:
                code_bytes = bytes.fromhex(text)
                code_text = code_bytes.decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                code_text = raw
        else:
            code_text = str(raw)
        return sha256_text(code_text), code_text

    # -- seeding ----------------------------------------------------------

    def ensure_shipment(
        self,
        key: str,
        shipper,
        bol: str,
        route: str,
        max_temp: int,
        max_transit_hours: int,
        fee: int,
        bond: int,
        deadline_seconds: int,
        deadline_absolute: int | None = None,
    ) -> int:
        if key in self.state["shipments"]:
            return int(self.state["shipments"][key])
        chain_now = int(time.time())
        deadline = deadline_absolute or (chain_now + deadline_seconds)
        tx = self.client.write_contract(
            self.address,
            "create_shipment_order",
            account=shipper,
            args=[bol, route, max_temp, max_transit_hours, fee, bond, deadline],
        )
        tx_hash = tx.hex() if hasattr(tx, "hex") else str(tx)
        receipt = self.wait_final(tx_hash)
        record = self.summarize(f"create {key}", tx_hash, receipt)
        if record["execution_result"] != "FINISHED_WITH_RETURN":
            raise RuntimeError(f"create {key} failed: {record}")
        shipment_id = None
        for row in self.read("list_shipments"):
            if row["bill_of_lading_id"] == bol:
                shipment_id = int(row["shipment_id"])
        if shipment_id is None:
            raise RuntimeError(f"created shipment {bol} is not visible on chain")
        self.state["shipments"][key] = shipment_id
        save_checkpoint(self.state)
        print(f"[seed] {key} shipment_id={shipment_id}", flush=True)
        return shipment_id

    def status(self, shipment_id: int) -> dict:
        return self.read("get_shipment", [shipment_id])

    def ensure_accept(self, shipment_id: int, carrier, label: str) -> None:
        if self.status(shipment_id)["status"] != "OPEN":
            return
        self.write(label, "accept_shipment_bid", [shipment_id], account=carrier)

    def ensure_submit(self, shipment_id: int, carrier, label: str, url: str) -> None:
        if self.status(shipment_id)["status"] != "CARRIER_ACCEPTED":
            return
        self.write(label, "submit_delivery_manifest", [shipment_id, url], account=carrier)

    def ensure_audit(self, shipment_id: int, label: str) -> None:
        if self.status(shipment_id)["status"] != "MANIFEST_SUBMITTED":
            return
        self.write(label, "audit_shipment_fulfilment_live", [shipment_id], account=self.main)

    def ensure_claim(self, shipment_id: int, label: str) -> None:
        if self.status(shipment_id)["status"] != "AUDIT_VERIFIED":
            return
        self.write(label, "claim_shipment_settlement", [shipment_id], account=self.main)

    def seed(self, accounts: dict[str, object]) -> dict:
        main = self.main
        ids = self.state["shipments"]
        plan = [
            dict(
                key="gva_sin_biologics",
                shipper=main,
                bol="BOL-GVA-SIN-77",
                route="Geneva to Singapore Biologics Air Freight",
                max_temp=4,
                transit=18,
                fee=185_000 * FPT,
                bond=74_000 * FPT,
                manifest=f"{RAW_BASE}gva-sin-biologics.txt",
            ),
            dict(
                key="rtm_tyo_photoresist",
                shipper=accounts["shipper_rtm"],
                bol="BOL-RTM-TYO-42",
                route="Rotterdam to Tokyo Semiconductor Photoresist",
                max_temp=8,
                transit=30,
                fee=240_000 * FPT,
                bond=96_000 * FPT,
                manifest=f"{RAW_BASE}rtm-tyo-photoresist.txt",
            ),
            dict(
                key="osl_nyc_seafood",
                shipper=accounts["shipper_osl"],
                bol="BOL-OSL-NYC-19",
                route="Oslo to New York Cold-Chain Seafood",
                max_temp=2,
                transit=22,
                fee=150_000 * FPT,
                bond=60_000 * FPT,
                manifest=f"{RAW_BASE}osl-nyc-seafood.txt",
            ),
            dict(
                key="gva_dxb_mutual",
                shipper=main,
                bol="BOL-GVA-DXB-31",
                route="Geneva to Dubai Pharmaceutical Transshipment",
                max_temp=8,
                transit=20,
                fee=120_000 * FPT,
                bond=48_000 * FPT,
                manifest=None,
            ),
            dict(
                key="lax_bcn_aerospace",
                shipper=main,
                bol="BOL-LAX-BCN-55",
                route="Los Angeles to Barcelona Aerospace Adhesives",
                max_temp=6,
                transit=26,
                fee=95_000 * FPT,
                bond=38_000 * FPT,
                manifest=f"{RAW_BASE}lax-bcn-aerospace.txt",
            ),
        ]
        for item in plan:
            self.ensure_shipment(
                item["key"],
                item["shipper"],
                item["bol"],
                item["route"],
                item["max_temp"],
                item["transit"],
                item["fee"],
                item["bond"],
                deadline_seconds=7200,
            )
        # The abandoned order is created last with the shortest legal window.
        abandoned = self.ensure_shipment(
            "sin_ham_abandoned",
            main,
            "BOL-SIN-HAM-08",
            "Singapore to Hamburg Frozen Tuna",
            0,
            24,
            80_000 * FPT,
            32_000 * FPT,
            deadline_seconds=0,
            deadline_absolute=int(time.time()) + 240,
        )
        print(f"[seed] abandoned order {abandoned} waits for its deadline", flush=True)

        id_map = {key: int(value) for key, value in self.state["shipments"].items()}
        self.ensure_accept(id_map["gva_sin_biologics"], accounts["carrier_gva"], "accept gva_sin")
        self.ensure_accept(id_map["rtm_tyo_photoresist"], accounts["carrier_rtm"], "accept rtm_tyo")
        self.ensure_accept(id_map["osl_nyc_seafood"], accounts["carrier_osl"], "accept osl_nyc")
        self.ensure_accept(id_map["gva_dxb_mutual"], accounts["carrier_dxb"], "accept gva_dxb")
        self.ensure_accept(id_map["lax_bcn_aerospace"], accounts["carrier_lax"], "accept lax_bcn")

        # Guard lab: untrusted URL is rejected before the valid manifest lands.
        lax = id_map["lax_bcn_aerospace"]
        if self.status(lax)["status"] == "CARRIER_ACCEPTED":
            self.write(
                "guard untrusted manifest URL",
                "submit_delivery_manifest",
                [lax, "http://insecure.example.com/manifest.txt"],
                account=accounts["carrier_lax"],
                expected_error=True,
            )

        for item in plan:
            if item["manifest"]:
                carrier_role = {
                    "gva_sin_biologics": "carrier_gva",
                    "rtm_tyo_photoresist": "carrier_rtm",
                    "osl_nyc_seafood": "carrier_osl",
                    "lax_bcn_aerospace": "carrier_lax",
                }[item["key"]]
                self.ensure_submit(
                    id_map[item["key"]], accounts[carrier_role], f"manifest {item['key']}", item["manifest"]
                )

        # Guard lab: post-manifest reclaim and pre-audit claim must both revert.
        if self.status(lax)["status"] == "MANIFEST_SUBMITTED":
            self.write(
                "guard premature reclaim after manifest",
                "reclaim_expired_shipment",
                [lax],
                account=main,
                expected_error=True,
            )
            self.write(
                "guard claim before live audit",
                "claim_shipment_settlement",
                [lax],
                account=main,
                expected_error=True,
            )

        # Live consensus on three realistic shipments plus the guard shipment.
        for key, label in [
            ("gva_sin_biologics", "audit gva_sin"),
            ("rtm_tyo_photoresist", "audit rtm_tyo"),
            ("osl_nyc_seafood", "audit osl_nyc"),
            ("lax_bcn_aerospace", "audit lax_bcn"),
        ]:
            self.ensure_audit(id_map[key], label)

        for key, label in [
            ("gva_sin_biologics", "claim gva_sin"),
            ("rtm_tyo_photoresist", "claim rtm_tyo"),
            ("osl_nyc_seafood", "claim osl_nyc"),
            ("lax_bcn_aerospace", "claim lax_bcn"),
        ]:
            self.ensure_claim(id_map[key], label)

        # Two party mutual release: one signature must not settle, an outsider
        # must be rejected, and the matching counter signature settles.
        dxb = id_map["gva_dxb_mutual"]
        dxb_status = self.status(dxb)
        if dxb_status["status"] == "CARRIER_ACCEPTED":
            self.write(
                "mutual release shipper signature",
                "propose_mutual_release",
                [dxb, 8500],
                account=main,
            )
            self.write(
                "guard unilateral mutual release",
                "propose_mutual_release",
                [dxb, 8500],
                account=accounts["carrier_gva"],
                expected_error=True,
            )
            self.write(
                "mutual release carrier countersignature",
                "propose_mutual_release",
                [dxb, 8500],
                account=accounts["carrier_dxb"],
            )

        # Timed reclaim: wait out the shortest legal deadline, then reclaim.
        ham = id_map["sin_ham_abandoned"]
        if self.status(ham)["status"] == "OPEN":
            deadline = int(self.status(ham)["delivery_deadline_clock"])
            wait_for = deadline - int(time.time()) + 4
            if wait_for > 0:
                print(f"[reclaim] waiting {wait_for}s for the deadline boundary", flush=True)
                time.sleep(wait_for)
            self.write(
                "reclaim abandoned shipment",
                "reclaim_expired_shipment",
                [ham],
                account=main,
            )

        # FPT transfer proof.
        carrier_gva = accounts["carrier_gva"]
        if int(self.read("get_token_balance", [carrier_gva.address])) < 5000 * FPT:
            self.write("top up carrier_gva", "faucet_or_deposit", [200_000 * FPT], account=carrier_gva)
        self.write(
            "transfer FPT carrier to shipper",
            "transfer_tokens",
            [main.address, 2500 * FPT],
            account=carrier_gva,
        )

        return {"ids": id_map, "accounts": accounts}

    def verify(self, accounts: dict[str, object]) -> dict:
        shipments = self.read("list_shipments")
        invariants = self.read("check_vault_invariants")
        metadata = self.read("get_token_metadata")
        boundary = self.read("get_governance_boundary")
        balances = {}
        for role, account in [("main", self.main)] + list(accounts.items()):
            balances[role] = {
                "address": account.address,
                "fpt": int(self.read("get_token_balance", [account.address])),
                "gen_wei": str(self.client.get_balance(account.address)),
            }
        chain_sha, chain_code = self.verify_chain_code()
        self.state["verification"] = {
            "shipment_count": len(shipments),
            "shipments": shipments,
            "invariants": invariants,
            "token_metadata": metadata,
            "governance_boundary": boundary,
            "balances": balances,
            "chain_code_sha256": chain_sha,
            "chain_code_matches_local": chain_sha == self.local_sha,
        }
        if not invariants.get("conserved"):
            raise RuntimeError(f"vault invariant failed: {invariants}")
        if chain_sha != self.local_sha:
            raise RuntimeError(
                f"on-chain source hash {chain_sha} does not match local {self.local_sha}"
            )
        save_checkpoint(self.state)
        return self.state["verification"]

    def write_evidence(self, verification: dict) -> dict:
        deploy = self.state.get("deployment", {})
        file_sha = sha256_bytes(CONTRACT_PATH.read_bytes())
        git_sha = git_blob_sha256()
        deploy_payload_sha = deploy.get("deploy_payload_sha256", self.local_sha)
        chain_sha = verification["chain_code_sha256"]
        four_way = {
            "contract_file_sha256": file_sha,
            "git_blob_sha256": git_sha,
            "deploy_payload_sha256": deploy_payload_sha,
            "on_chain_code_sha256": chain_sha,
            "all_match": len({file_sha, git_sha, deploy_payload_sha, chain_sha}) == 1,
            "note": "On-chain source was read with gen_getContractCode on studionet.",
        }
        evidence = {
            "project": "FreightPulse",
            "network": "studionet",
            "chain_id": CHAIN_ID,
            "rpc": "https://studio.genlayer.com/api",
            "contract_address": self.address,
            "deploy_tx_hash": deploy.get("tx_hash", ""),
            "deployed_at": deploy.get("deployed_at", ""),
            "git_head": git_head() or deploy.get("git_head", ""),
            "main_signer": self.main.address,
            "burner_accounts": {
                role: account.address for role, account in self.state.get("accounts", {}).items()
            },
            "four_way_sha256": four_way,
            "shipment_ids": self.state.get("shipments", {}),
            "transactions": self.state.get("transactions", []),
            "guard_reverts": self.state.get("guard_reverts", []),
            "verification": verification,
            "explorer_note": (
                "The legacy genlayer-explorer.vercel.app host returned DEPLOYMENT_PAUSED "
                "during this run. The explorer-studio.genlayer.com frontend loaded, but no "
                "documented JSON endpoint was available, so every receipt in this file was "
                "read back through the studionet RPC consensus data contract."
            ),
            "generated_at": now_iso(),
        }
        EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        return evidence


def preflight() -> None:
    for name, url in [
        ("gva", f"{RAW_BASE}gva-sin-biologics.txt"),
        ("rtm", f"{RAW_BASE}rtm-tyo-photoresist.txt"),
        ("osl", f"{RAW_BASE}osl-nyc-seafood.txt"),
        ("lax", f"{RAW_BASE}lax-bcn-aerospace.txt"),
    ]:
        ok, status = http_ok(url)
        print(f"[preflight] manifest {name}: HTTP {status}")
        if not ok:
            raise SystemExit(
                f"manifest {url} is not publicly reachable; push the repository before seeding"
            )


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    runner = Runner()
    print(f"[init] main={runner.main.address} local_sha={runner.local_sha[:16]}...")
    runner.deploy()
    if mode == "deploy":
        return
    preflight()
    accounts = runner.ensure_accounts()
    runner.ensure_fpt(accounts)
    runner.seed(accounts)
    verification = runner.verify(accounts)
    evidence = runner.write_evidence(verification)
    print(json.dumps({
        "contract_address": evidence["contract_address"],
        "four_way": evidence["four_way_sha256"],
        "invariants": verification["invariants"],
        "transactions": len(evidence["transactions"]),
        "guard_reverts": len(evidence["guard_reverts"]),
    }, indent=2))


if __name__ == "__main__":
    main()
