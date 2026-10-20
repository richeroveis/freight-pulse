"""Shared fixtures and helpers for FreightPulse direct mode tests.

The os.unlink/os.remove shim keeps the suite usable on Windows runners where
SQLite and pytest tmp dirs can hold file handles open for a moment.
"""

from __future__ import annotations

import json
import os
import sys
from types import SimpleNamespace

import pytest


if sys.platform == "win32":  # pragma: no cover - exercised only on Windows
    _real_unlink = os.unlink
    _real_remove = os.remove

    def _force_unlink(path, *args, **kwargs):
        import stat

        try:
            _real_unlink(path, *args, **kwargs)
        except PermissionError:
            os.chmod(path, stat.S_IWRITE)
            _real_unlink(path, *args, **kwargs)

    os.unlink = _force_unlink
    os.remove = _force_unlink


FPT = 10**6
BASE_ISO = "2030-01-01T00:00:00Z"
BASE_TS = 1893456000
DEFAULT_FEE = 50_000 * FPT
DEFAULT_BOND = 20_000 * FPT
DEFAULT_DEADLINE = BASE_TS + 3600
DEFAULT_BOL = "BOL-GVA-SIN-001"
DEFAULT_ROUTE = "Geneva to Singapore"
MANIFEST_URL = "https://cargo.example.com/manifests/bol-gva-sin-001.txt"


def set_chain_time(direct_vm, iso_timestamp: str) -> None:
    """Move both the direct VM clock and the injected transaction datetime."""
    direct_vm.warp(iso_timestamp)
    import genlayer.gl as gl_module

    gl_module.message_raw["datetime"] = iso_timestamp


def addr_hex(account) -> str:
    """Render a direct mode test account as a 0x address string."""
    if isinstance(account, str):
        return account
    return "0x" + bytes(account).hex()


def mint(direct_vm, contract, account, amount: int = 5_000_000 * FPT) -> None:
    direct_vm.sender = account
    contract.faucet_or_deposit(amount)


def create_order(
    direct_vm,
    contract,
    shipper,
    fee: int = DEFAULT_FEE,
    bond: int = DEFAULT_BOND,
    deadline: int = DEFAULT_DEADLINE,
    bol: str = DEFAULT_BOL,
    route: str = DEFAULT_ROUTE,
    max_temp: int = 4,
    max_transit_hours: int = 18,
) -> int:
    direct_vm.sender = shipper
    return contract.create_shipment_order(
        bol, route, max_temp, max_transit_hours, fee, bond, deadline
    )


def accept(direct_vm, contract, carrier, shipment_id: int) -> None:
    direct_vm.sender = carrier
    contract.accept_shipment_bid(shipment_id)


def submit(direct_vm, contract, carrier, shipment_id: int, url: str = MANIFEST_URL) -> None:
    direct_vm.sender = carrier
    contract.submit_delivery_manifest(shipment_id, url)


def mock_manifest(
    direct_vm,
    direct_vm_llm_payload: dict | str,
    body: str | None = None,
    url_pattern: str = r"https://cargo\.example\.com/manifests/.*",
) -> None:
    payload_dict = direct_vm_llm_payload if isinstance(direct_vm_llm_payload, dict) else {}
    temperature = payload_dict.get("peak_temp_celsius", 2.1)
    transit = payload_dict.get("transit_hours", 14.5)
    customs = "CLEARED" if payload_dict.get("customs_cleared", True) else "REJECTED"
    default_body = (
        "FREIGHT PULSE CARRIER DELIVERY MANIFEST\n"
        f"Bill of lading: {DEFAULT_BOL}\n"
        "Vessel voyage: FP-204\n"
        f"Customs status: {customs}\n"
        f"Peak cargo temperature: {temperature if temperature is not None else 2.1} C\n"
        f"Transit time: {transit if transit is not None else 14.5} h\n"
    )
    direct_vm.mock_web(url_pattern, {"status": 200, "body": body or default_body})
    payload = (
        direct_vm_llm_payload
        if isinstance(direct_vm_llm_payload, str)
        else json.dumps(_encode_numbers_as_strings(direct_vm_llm_payload))
    )
    direct_vm.mock_llm(r"(?s).*cold-chain cargo auditor.*", payload)


def _encode_numbers_as_strings(value):
    """Direct mode mock replies travel through calldata, so keep floats textual."""
    if isinstance(value, float):
        return str(value)
    if isinstance(value, dict):
        return {key: _encode_numbers_as_strings(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_encode_numbers_as_strings(item) for item in value]
    return value


def default_analysis(**overrides) -> dict:
    payload = {
        "bill_of_lading_id": DEFAULT_BOL,
        "customs_cleared": True,
        "peak_temp_celsius": 2.1,
        "transit_hours": 14.5,
        "evidence_excerpt": "Customs status: CLEARED; peak 2.1 C",
    }
    payload.update(overrides)
    return payload


def audit(direct_vm, contract, caller, shipment_id: int) -> dict:
    direct_vm.sender = caller
    return contract.audit_shipment_fulfilment_live(shipment_id)


@pytest.fixture
def world(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Deployed contract with three funded test accounts and a fixed clock."""
    contract = direct_deploy("contracts/freight_pulse.py")
    set_chain_time(direct_vm, BASE_ISO)
    for account in (direct_alice, direct_bob, direct_charlie):
        mint(direct_vm, contract, account)
    return SimpleNamespace(
        contract=contract,
        vm=direct_vm,
        alice=direct_alice,
        bob=direct_bob,
        charlie=direct_charlie,
    )


@pytest.fixture
def shipment(world):
    """One open shipment funded by alice, ready for carrier bob."""
    shipment_id = create_order(world.vm, world.contract, world.alice)
    return SimpleNamespace(
        id=shipment_id,
        shipper=world.alice,
        carrier=world.bob,
        contract=world.contract,
        vm=world.vm,
    )
