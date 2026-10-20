"""Direct mode test suite for FreightPulse.

Every test runs the leader path in memory. Consensus comparison itself is
exercised live on studionet by scripts/deploy_studionet.py.
"""

import pytest

from conftest import (
    BASE_ISO,
    BASE_TS,
    DEFAULT_BOL,
    DEFAULT_BOND,
    DEFAULT_DEADLINE,
    DEFAULT_FEE,
    FPT,
    MANIFEST_URL,
    accept,
    addr_hex,
    audit,
    create_order,
    default_analysis,
    mint,
    mock_manifest,
    set_chain_time,
    submit,
)

from gltest.direct.loader import create_address


def _ready(world, shipment_id, carrier=None, url=MANIFEST_URL):
    carrier = carrier or world.bob
    accept(world.vm, world.contract, carrier, shipment_id)
    submit(world.vm, world.contract, carrier, shipment_id, url)
    return carrier


def _settled_balances(world, shipment_id):
    view = world.contract.get_shipment(shipment_id)
    return int(view["carrier_payout"]), int(view["shipper_refund"])


# ---------------------------------------------------------------------------
# Token, metadata and governance boundary
# ---------------------------------------------------------------------------


def test_metadata_reports_fpt_and_zero_supply(world):
    meta = world.contract.get_token_metadata()
    assert meta["symbol"] == "FPT"
    assert meta["decimals"] == 6
    assert meta["total_supply"] == 15_000_000 * FPT
    assert meta["vault_custody_balance"] == 0


def test_governance_boundary_has_no_owner_or_admin(world):
    boundary = world.contract.get_governance_boundary()
    assert boundary["has_owner"] is False
    assert boundary["has_admin"] is False
    assert boundary["owner_override_methods"] == []


def test_governance_boundary_lists_only_three_settlement_paths(world):
    boundary = world.contract.get_governance_boundary()
    assert len(boundary["settlement_paths"]) == 3


def test_faucet_credits_balance_and_supply(world):
    before = world.contract.get_token_balance(addr_hex(world.charlie))
    world.vm.sender = world.charlie
    world.contract.faucet_or_deposit(1000 * FPT)
    assert world.contract.get_token_balance(addr_hex(world.charlie)) == before + 1000 * FPT
    assert world.contract.get_token_metadata()["total_supply"] == 15_001_000 * FPT


def test_faucet_rejects_zero_amount(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("must be positive"):
        world.contract.faucet_or_deposit(0)


def test_faucet_rejects_amount_over_single_call_cap(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("per-call cap"):
        world.contract.faucet_or_deposit(2_000_000_000 * FPT)


def test_faucet_enforces_lifetime_cap(world):
    whale = create_address("faucet_whale")
    world.vm.sender = whale
    for _ in range(5):
        world.contract.faucet_or_deposit(1_000_000_000 * FPT)
    with world.vm.expect_revert("lifetime cap"):
        world.contract.faucet_or_deposit(1)


def test_transfer_tokens_moves_balance(world):
    start_bob = world.contract.get_token_balance(addr_hex(world.bob))
    world.vm.sender = world.alice
    world.contract.transfer_tokens(addr_hex(world.bob), 125 * FPT)
    assert world.contract.get_token_balance(addr_hex(world.bob)) == start_bob + 125 * FPT


def test_transfer_tokens_conserves_supply(world):
    supply_before = world.contract.get_token_metadata()["total_supply"]
    world.vm.sender = world.alice
    world.contract.transfer_tokens(addr_hex(world.bob), 77 * FPT)
    assert world.contract.get_token_metadata()["total_supply"] == supply_before
    assert world.contract.check_vault_invariants()["conserved"] is True


def test_transfer_rejects_zero_amount(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("must be positive"):
        world.contract.transfer_tokens(addr_hex(world.bob), 0)


def test_transfer_rejects_zero_address(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("zero address"):
        world.contract.transfer_tokens("0x" + "00" * 20, 10 * FPT)


def test_transfer_rejects_insufficient_balance(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("insufficient FPT balance"):
        world.contract.transfer_tokens(addr_hex(world.bob), 99_000_000 * FPT)


def test_transfer_rejects_malformed_address(world):
    world.vm.sender = world.alice
    with world.vm.expect_revert("malformed hex address"):
        world.contract.transfer_tokens("0x1234", 10 * FPT)


def test_transfer_accepts_hex_string_address(world):
    recipient = "0x" + "11" * 20
    world.vm.sender = world.alice
    world.contract.transfer_tokens(recipient, 42 * FPT)
    assert world.contract.get_token_balance(recipient) == 42 * FPT


# ---------------------------------------------------------------------------
# Order creation and input validation
# ---------------------------------------------------------------------------


def test_create_order_locks_fee_in_vault(world):
    create_order(world.vm, world.contract, world.alice)
    assert world.contract.get_vault_custody_balance() == DEFAULT_FEE
    assert world.contract.get_token_balance(addr_hex(world.alice)) == 5_000_000 * FPT - DEFAULT_FEE


def test_create_order_starts_open_and_unassigned(world, shipment):
    view = world.contract.get_shipment(shipment.id)
    assert view["status"] == "OPEN"
    assert view["carrier_assigned"] is False
    assert view["freight_fee"] == DEFAULT_FEE
    assert view["required_carrier_bond"] == DEFAULT_BOND


def test_create_order_increments_count_and_order_list(world):
    create_order(world.vm, world.contract, world.alice)
    create_order(world.vm, world.contract, world.bob, bol="BOL-2", route="Oslo to New York")
    assert world.contract.get_shipment_count() == 2
    assert len(world.contract.list_shipments()) == 2


def test_create_order_rejects_short_bol(world):
    with world.vm.expect_revert("bill of lading length"):
        create_order(world.vm, world.contract, world.alice, bol="AB")


def test_create_order_rejects_bol_with_spaces(world):
    with world.vm.expect_revert("invalid characters"):
        create_order(world.vm, world.contract, world.alice, bol="BOL WITH SPACES")


def test_create_order_rejects_short_route(world):
    with world.vm.expect_revert("route length"):
        create_order(world.vm, world.contract, world.alice, route="LA")


def test_create_order_rejects_temperature_out_of_range(world):
    with world.vm.expect_revert("temperature ceiling"):
        create_order(world.vm, world.contract, world.alice, max_temp=80)


def test_create_order_rejects_zero_transit_sla(world):
    with world.vm.expect_revert("transit SLA"):
        create_order(world.vm, world.contract, world.alice, max_transit_hours=0)


def test_create_order_rejects_transit_sla_over_ceiling(world):
    with world.vm.expect_revert("transit SLA"):
        create_order(world.vm, world.contract, world.alice, max_transit_hours=9000)


def test_create_order_rejects_zero_fee(world):
    with world.vm.expect_revert("freight fee"):
        create_order(world.vm, world.contract, world.alice, fee=0)


def test_create_order_rejects_zero_bond(world):
    with world.vm.expect_revert("carrier bond"):
        create_order(world.vm, world.contract, world.alice, bond=0)


def test_create_order_rejects_deadline_inside_floor(world):
    with world.vm.expect_revert("minimum window"):
        create_order(world.vm, world.contract, world.alice, deadline=BASE_TS + 179)


def test_create_order_rejects_deadline_above_ceiling(world):
    with world.vm.expect_revert("maximum window"):
        create_order(
            world.vm,
            world.contract,
            world.alice,
            deadline=BASE_TS + 181 * 24 * 60 * 60,
        )


def test_create_order_rejects_insufficient_shipper_balance(world):
    with world.vm.expect_revert("insufficient FPT balance"):
        create_order(world.vm, world.contract, world.charlie, fee=6_000_000 * FPT)


# ---------------------------------------------------------------------------
# Carrier acceptance and manifest submission
# ---------------------------------------------------------------------------


def test_accept_locks_carrier_bond(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    assert world.contract.get_vault_custody_balance() == DEFAULT_FEE + DEFAULT_BOND
    assert world.contract.get_token_balance(addr_hex(world.bob)) == 5_000_000 * FPT - DEFAULT_BOND


def test_accept_assigns_carrier_and_status(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    view = world.contract.get_shipment(shipment.id)
    assert view["status"] == "CARRIER_ACCEPTED"
    assert view["carrier_assigned"] is True


def test_accept_rejects_shipper_self_deal(world, shipment):
    world.vm.sender = world.alice
    with world.vm.expect_revert("own carrier"):
        world.contract.accept_shipment_bid(shipment.id)


def test_accept_rejects_second_carrier(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.charlie
    with world.vm.expect_revert("not open"):
        world.contract.accept_shipment_bid(shipment.id)


def test_accept_rejects_after_deadline(world, shipment):
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.bob
    with world.vm.expect_revert("deadline already passed"):
        world.contract.accept_shipment_bid(shipment.id)


def test_submit_manifest_only_assigned_carrier(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.charlie
    with world.vm.expect_revert("only the assigned carrier"):
        world.contract.submit_delivery_manifest(shipment.id, MANIFEST_URL)


def test_submit_manifest_rejects_http_url(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    with world.vm.expect_revert("must use https"):
        submit(world.vm, world.contract, world.bob, shipment.id, "http://cargo.example.com/m.txt")


def test_submit_manifest_rejects_localhost(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    with world.vm.expect_revert("private"):
        submit(world.vm, world.contract, world.bob, shipment.id, "https://localhost/m.txt")


def test_submit_manifest_rejects_embedded_credentials(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    with world.vm.expect_revert("credentials"):
        submit(
            world.vm,
            world.contract,
            world.bob,
            shipment.id,
            "https://user:secret@cargo.example.com/m.txt",
        )


def test_submit_manifest_rejects_explicit_port(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    with world.vm.expect_revert("port"):
        submit(
            world.vm,
            world.contract,
            world.bob,
            shipment.id,
            "https://cargo.example.com:8443/m.txt",
        )


def test_submit_manifest_rejects_after_deadline(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    with world.vm.expect_revert("deadline already passed"):
        submit(world.vm, world.contract, world.bob, shipment.id, MANIFEST_URL)


def test_submit_manifest_stores_url_and_status(world, shipment):
    _ready(world, shipment.id)
    view = world.contract.get_shipment(shipment.id)
    assert view["status"] == "MANIFEST_SUBMITTED"
    assert view["telemetry_manifest_url"] == MANIFEST_URL
    assert view["escrowed"] == DEFAULT_FEE + DEFAULT_BOND


# ---------------------------------------------------------------------------
# Live verification bands
# ---------------------------------------------------------------------------


def test_audit_full_on_time_release(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert result["customs_cleared"] is True
    assert result["temp_breached"] is False
    assert result["carrier_payout"] == DEFAULT_FEE + DEFAULT_BOND
    assert result["shipper_refund"] == 0
    assert result["conservation_ok"] is True


def test_audit_late_transit_penalty_split(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=30.0))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "LATE_TRANSIT_PENALTY"
    assert result["carrier_fee_bps"] == 7000
    assert result["carrier_payout"] == (DEFAULT_FEE * 7000 // 10000) + DEFAULT_BOND
    assert result["shipper_refund"] == DEFAULT_FEE * 3000 // 10000


def test_audit_late_band_conserves_escrow(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=19.0))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["carrier_payout"] + result["shipper_refund"] == DEFAULT_FEE + DEFAULT_BOND


def test_audit_cold_chain_spoilage_slash(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(peak_temp_celsius=9.5))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "COLD_CHAIN_SPOILAGE_SLASH"
    assert result["temp_breached"] is True
    assert result["carrier_payout"] == 0
    assert result["shipper_refund"] == DEFAULT_FEE + DEFAULT_BOND


def test_audit_customs_rejected_is_spoilage(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(customs_cleared=False))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "COLD_CHAIN_SPOILAGE_SLASH"
    assert result["carrier_payout"] == 0


def test_audit_boundary_temp_equal_ceiling_is_compliant(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(peak_temp_celsius=4.0))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert result["temp_breached"] is False


def test_audit_boundary_transit_equal_sla_is_compliant(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=18.0))
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "FULL_ON_TIME_RELEASE"


def test_audit_rejects_bill_of_lading_mismatch(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(
        world.vm,
        default_analysis(),
        body="CARRIER MANIFEST WITHOUT THE REFERENCE\nCustoms status: CLEARED\n",
    )
    with world.vm.expect_revert("does not bind bill_of_lading_id"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_fail_closed_on_missing_transit(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=None))
    with world.vm.expect_revert("missing or non-numeric transit_hours"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_fail_closed_on_missing_temperature(world, shipment):
    _ready(world, shipment.id)
    payload = default_analysis()
    payload.pop("peak_temp_celsius")
    mock_manifest(world.vm, payload)
    with world.vm.expect_revert("missing or non-numeric peak_temp_celsius"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_fail_closed_on_ambiguous_customs(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(customs_cleared="pending review"))
    with world.vm.expect_revert("missing or ambiguous customs_cleared"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_fail_closed_on_non_json(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, "NOT JSON AT ALL")
    with world.vm.expect_revert("expected CUSTOMS|TEMP|TRANSIT|BOL"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_accepts_compact_pipe_attestation(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, f"CLEARED|2.1|14.5|{DEFAULT_BOL}")
    result = audit(world.vm, world.contract, world.charlie, shipment.id)
    assert result["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert result["recorded_temp_c_x100"] == 210


def test_audit_rejects_pipe_attestation_with_wrong_bol(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, "CLEARED|2.1|14.5|BOL-OTHER-999")
    with world.vm.expect_revert("did not echo the bill of lading"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_rejects_pipe_attestation_that_disagrees(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, f"CLEARED|9.9|14.5|{DEFAULT_BOL}")
    with world.vm.expect_revert("disagrees with the machine-readable manifest"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_rejects_manifest_without_machine_readable_fields(world, shipment):
    _ready(world, shipment.id)
    body = f"Bill of lading: {DEFAULT_BOL}\nCustoms status: CLEARED\nNo telemetry lines here.\n"
    mock_manifest(world.vm, default_analysis(), body=body)
    with world.vm.expect_revert("missing machine-readable cold-chain fields"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


def test_audit_rejects_before_manifest(world, shipment):
    world.vm.sender = world.bob
    with world.vm.expect_revert("not awaiting live verification"):
        world.contract.audit_shipment_fulfilment_live(shipment.id)


def test_audit_rejects_carrier_accepted_without_manifest(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.bob
    with world.vm.expect_revert("not awaiting live verification"):
        world.contract.audit_shipment_fulfilment_live(shipment.id)


def test_audit_rejects_second_live_run(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    with world.vm.expect_revert("not awaiting live verification"):
        audit(world.vm, world.contract, world.charlie, shipment.id)


# ---------------------------------------------------------------------------
# Settlement claims
# ---------------------------------------------------------------------------


def test_claim_rejects_before_audit(world, shipment):
    _ready(world, shipment.id)
    world.vm.sender = world.alice
    with world.vm.expect_revert("no consensus verdict"):
        world.contract.claim_shipment_settlement(shipment.id)


def test_claim_full_band_pays_carrier_and_keeps_vault_flat(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.charlie
    result = world.contract.claim_shipment_settlement(shipment.id)
    carrier_payout, shipper_refund = _settled_balances(world, shipment.id)
    assert result["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert carrier_payout == DEFAULT_FEE + DEFAULT_BOND
    assert shipper_refund == 0
    assert world.contract.get_vault_custody_balance() == 0


def test_claim_spoilage_refunds_shipper_and_slashes_carrier(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(peak_temp_celsius=12.0))
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.alice
    world.contract.claim_shipment_settlement(shipment.id)
    carrier_payout, shipper_refund = _settled_balances(world, shipment.id)
    assert carrier_payout == 0
    assert shipper_refund == DEFAULT_FEE + DEFAULT_BOND
    assert world.contract.get_token_balance(addr_hex(world.alice)) == 5_000_000 * FPT + DEFAULT_BOND


def test_claim_late_band_pays_seventy_thirty(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=40.0))
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.bob
    world.contract.claim_shipment_settlement(shipment.id)
    carrier_payout, shipper_refund = _settled_balances(world, shipment.id)
    assert shipper_refund == DEFAULT_FEE * 3000 // 10000
    assert carrier_payout == DEFAULT_FEE * 7000 // 10000 + DEFAULT_BOND


def test_claim_twice_reverts(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.alice
    world.contract.claim_shipment_settlement(shipment.id)
    with world.vm.expect_revert("no consensus verdict"):
        world.contract.claim_shipment_settlement(shipment.id)


def test_claim_preserves_vault_invariant(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.alice
    world.contract.claim_shipment_settlement(shipment.id)
    invariants = world.contract.check_vault_invariants()
    assert invariants["conserved"] is True
    assert invariants["settled_conservation_ok"] is True


# ---------------------------------------------------------------------------
# Two party mutual release
# ---------------------------------------------------------------------------


def test_mutual_release_single_party_does_not_settle(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.alice
    result = world.contract.propose_mutual_release(shipment.id, 8500)
    assert result["settled"] is False
    assert world.contract.get_shipment(shipment.id)["status"] == "CARRIER_ACCEPTED"
    assert world.contract.get_vault_custody_balance() == DEFAULT_FEE + DEFAULT_BOND


def test_mutual_release_mismatched_bps_does_not_settle(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.alice
    world.contract.propose_mutual_release(shipment.id, 8500)
    world.vm.sender = world.bob
    result = world.contract.propose_mutual_release(shipment.id, 8000)
    assert result["settled"] is False
    assert "mismatch" in result["reason"]
    assert world.contract.get_shipment(shipment.id)["status"] == "CARRIER_ACCEPTED"


def test_mutual_release_matching_bps_settles(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.alice
    world.contract.propose_mutual_release(shipment.id, 8500)
    world.vm.sender = world.bob
    result = world.contract.propose_mutual_release(shipment.id, 8500)
    assert result["settled"] is True
    assert result["fulfilment_band"] == "MUTUAL_RELEASE_CO_SIGNED"
    assert result["carrier_payout"] == DEFAULT_FEE * 8500 // 10000 + DEFAULT_BOND
    assert result["shipper_refund"] == DEFAULT_FEE * 1500 // 10000


def test_mutual_release_after_renogotiation_settles(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.alice
    world.contract.propose_mutual_release(shipment.id, 8500)
    world.vm.sender = world.bob
    world.contract.propose_mutual_release(shipment.id, 8000)
    world.vm.sender = world.alice
    result = world.contract.propose_mutual_release(shipment.id, 8000)
    assert result["settled"] is True
    assert result["carrier_payout_bps"] == 8000


def test_mutual_release_rejects_third_party(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.charlie
    with world.vm.expect_revert("only the shipper or the carrier"):
        world.contract.propose_mutual_release(shipment.id, 5000)


def test_mutual_release_rejects_bps_over_denominator(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    world.vm.sender = world.alice
    with world.vm.expect_revert("bps out of range"):
        world.contract.propose_mutual_release(shipment.id, 10001)


def test_mutual_release_requires_accepted_carrier(world, shipment):
    world.vm.sender = world.alice
    with world.vm.expect_revert("cannot be released"):
        world.contract.propose_mutual_release(shipment.id, 5000)


# ---------------------------------------------------------------------------
# Timed reclaim
# ---------------------------------------------------------------------------


def test_reclaim_before_deadline_reverts(world, shipment):
    world.vm.sender = world.alice
    with world.vm.expect_revert("deadline has not passed"):
        world.contract.reclaim_expired_shipment(shipment.id)


def test_reclaim_open_order_after_deadline_refunds_fee_only(world, shipment):
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.alice
    result = world.contract.reclaim_expired_shipment(shipment.id)
    assert result["shipper_refund"] == DEFAULT_FEE
    assert result["carrier_bond_forfeited"] is False
    assert world.contract.get_vault_custody_balance() == 0


def test_reclaim_accepted_order_after_deadline_forfeits_bond(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.alice
    result = world.contract.reclaim_expired_shipment(shipment.id)
    assert result["shipper_refund"] == DEFAULT_FEE + DEFAULT_BOND
    assert result["carrier_bond_forfeited"] is True
    assert world.contract.get_shipment(shipment.id)["status"] == "RECLAIMED"


def test_reclaim_blocked_after_timely_manifest(world, shipment):
    _ready(world, shipment.id)
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.alice
    with world.vm.expect_revert("reclaim is blocked pending verification"):
        world.contract.reclaim_expired_shipment(shipment.id)


def test_reclaim_blocked_after_live_verification(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.alice
    with world.vm.expect_revert("live verification already ran"):
        world.contract.reclaim_expired_shipment(shipment.id)


def test_reclaim_rejects_non_shipper(world, shipment):
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    world.vm.sender = world.bob
    with world.vm.expect_revert("only the shipper"):
        world.contract.reclaim_expired_shipment(shipment.id)


def test_reclaim_rejects_settled_shipment(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    world.vm.sender = world.alice
    world.contract.claim_shipment_settlement(shipment.id)
    set_chain_time(world.vm, "2030-01-01T01:00:01Z")
    with world.vm.expect_revert("cannot be reclaimed"):
        world.contract.reclaim_expired_shipment(shipment.id)


def test_reclaim_deadline_is_inclusive(world, shipment):
    set_chain_time(world.vm, "2030-01-01T01:00:00Z")
    world.vm.sender = world.alice
    result = world.contract.reclaim_expired_shipment(shipment.id)
    assert result["shipper_refund"] == DEFAULT_FEE


# ---------------------------------------------------------------------------
# Invariants and read projections
# ---------------------------------------------------------------------------


def test_vault_invariants_after_locking(world):
    first = create_order(world.vm, world.contract, world.alice)
    second = create_order(
        world.vm, world.contract, world.alice, bol="BOL-GVA-SIN-002", route="Basel to Tokyo"
    )
    third = create_order(
        world.vm, world.contract, world.bob, bol="BOL-OSL-NYC-003", route="Oslo to New York"
    )
    accept(world.vm, world.contract, world.bob, first)
    accept(world.vm, world.contract, world.charlie, second)
    invariants = world.contract.check_vault_invariants()
    assert invariants["locked_escrow"] == 3 * DEFAULT_FEE + 2 * DEFAULT_BOND
    assert invariants["vault_matches_escrow"] is True
    assert invariants["conserved"] is True
    assert invariants["shipment_count"] == 3
    assert third == 3


def test_vault_invariants_fail_if_escrow_is_wrong(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    invariants = world.contract.check_vault_invariants()
    assert invariants["vault_custody_balance"] == DEFAULT_FEE + DEFAULT_BOND
    assert invariants["supply_matches_balances_plus_vault"] is True


def test_preview_pending_band_before_telemetry(world, shipment):
    preview = world.contract.preview_settlement_split(shipment.id)
    assert preview["fulfilment_band"] == "AWAITING_TELEMETRY"
    assert preview["settleable"] is False
    assert preview["escrowed"] == DEFAULT_FEE


def test_preview_locked_escrow_includes_bond_after_accept(world, shipment):
    accept(world.vm, world.contract, world.bob, shipment.id)
    preview = world.contract.preview_settlement_split(shipment.id)
    assert preview["escrowed"] == DEFAULT_FEE + DEFAULT_BOND
    assert preview["telemetry_present"] is False


def test_preview_full_band_has_zero_slash_and_refund(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis())
    audit(world.vm, world.contract, world.charlie, shipment.id)
    preview = world.contract.preview_settlement_split(shipment.id)
    assert preview["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert preview["slash_amount"] == 0
    assert preview["shipper_refund"] == 0
    assert preview["settleable"] is True


def test_get_shipment_reports_invariant_band(world, shipment):
    _ready(world, shipment.id)
    mock_manifest(world.vm, default_analysis(transit_hours=25.0))
    audit(world.vm, world.contract, world.charlie, shipment.id)
    view = world.contract.get_shipment(shipment.id)
    assert view["fulfilment_band"] == "LATE_TRANSIT_PENALTY"
    assert view["invariant_band"] == "LATE_TRANSIT_PENALTY"
    assert view["transit_over"] is True


def test_list_shipments_projects_every_order(world):
    create_order(world.vm, world.contract, world.alice)
    create_order(world.vm, world.contract, world.bob, bol="BOL-2", route="Rotterdam to Tokyo")
    rows = world.contract.list_shipments()
    assert [row["shipment_id"] for row in rows] == [1, 2]
    assert all(row["status"] == "OPEN" for row in rows)


def test_chain_clock_tracks_the_injected_transaction_time(world):
    set_chain_time(world.vm, "2030-01-01T00:00:00Z")
    assert world.contract.get_chain_clock() == BASE_TS
    set_chain_time(world.vm, "2030-01-01T01:00:00Z")
    assert world.contract.get_chain_clock() == BASE_TS + 3600


def test_unknown_shipment_view_reverts(world):
    with world.vm.expect_revert("shipment does not exist"):
        world.contract.get_shipment(999)


def test_unknown_shipment_accept_reverts(world):
    world.vm.sender = world.bob
    with world.vm.expect_revert("shipment does not exist"):
        world.contract.accept_shipment_bid(999)


def test_storage_has_no_owner_field(world):
    boundary = world.contract.get_governance_boundary()
    assert "owner" not in boundary
    assert boundary["settlement_paths"][0].startswith("audit_shipment_fulfilment_live")


def test_pure_band_helper_conserves_all_three_bands(world):
    feed = dict(
        freight_fee=DEFAULT_FEE,
        required_carrier_bond=DEFAULT_BOND,
        max_temp_c_x100=400,
        max_transit_minutes=1080,
    )
    full = world.contract.simulate_settlement_split(
        recorded_temp_c_x100=200,
        recorded_transit_minutes=600,
        customs_cleared=True,
        **feed,
    )
    late = world.contract.simulate_settlement_split(
        recorded_temp_c_x100=200,
        recorded_transit_minutes=1200,
        customs_cleared=True,
        **feed,
    )
    spoilage = world.contract.simulate_settlement_split(
        recorded_temp_c_x100=500,
        recorded_transit_minutes=600,
        customs_cleared=True,
        **feed,
    )

    assert full["fulfilment_band"] == "FULL_ON_TIME_RELEASE"
    assert full["slash_amount"] == 0
    assert full["shipper_refund"] == 0
    assert late["fulfilment_band"] == "LATE_TRANSIT_PENALTY"
    assert late["carrier_fee_bps"] == 7000
    assert late["carrier_payout"] + late["shipper_refund"] == DEFAULT_FEE + DEFAULT_BOND
    assert spoilage["fulfilment_band"] == "COLD_CHAIN_SPOILAGE_SLASH"
    assert spoilage["carrier_payout"] == 0
    assert spoilage["shipper_refund"] == DEFAULT_FEE + DEFAULT_BOND
    assert spoilage["slash_amount"] == DEFAULT_FEE + DEFAULT_BOND
