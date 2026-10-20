# FreightPulse adversarial security review

This note records the pre-submission adversarial review of the fund-holding contract
`contracts/freight_pulse.py`. Every party that can call the contract is assumed hostile,
including the shipper, the carrier, any caller who triggers an audit or claim, and anyone who
can influence the fetched external manifest text.

## 1. State machine

| Status | Who advances it | Next status | Funds movement |
| --- | --- | --- | --- |
| OPEN | shipper (create) | CARRIER_ACCEPTED (carrier), RECLAIMED (shipper after deadline) | fee locked on create; fee refunded on reclaim |
| CARRIER_ACCEPTED | carrier (accept) | MANIFEST_SUBMITTED, SETTLED (mutual release), RECLAIMED | bond locked on accept; refund fee+bond on reclaim |
| MANIFEST_SUBMITTED | assigned carrier (submit) | AUDIT_VERIFIED (consensus), SETTLED (mutual release) | none directly; audit then claim moves the full escrow |
| AUDIT_IN_PROGRESS | transient inside the audit tx | AUDIT_VERIFIED | none; a failed audit rolls the whole tx back |
| AUDIT_VERIFIED | any caller (claim) | SETTLED | carrier payout + shipper refund paid from vault, conserved |
| SETTLED | terminal | none | escrow fully distributed |
| RECLAIMED | terminal | none | escrow returned to shipper, carrier bond forfeited |

## 2. Liveness (no stuck funds)

- OPEN: shipper can always reclaim after the deadline; carrier can accept before it. No lock.
- CARRIER_ACCEPTED: shipper reclaims fee+bond after deadline (carrier forfeits); both can
  co-sign a mutual release before it. No lock.
- MANIFEST_SUBMITTED: reclaim is deliberately blocked so an on-time carrier cannot be walked
  away from. Two exits exist and neither can strand funds: `audit_shipment_fulfilment_live`
  is permissionless (any caller can trigger it, payouts go only to the fixed shipper and
  carrier addresses), and `propose_mutual_release` lets the two counterparties split their own
  escrow. Proven by `test_reclaim_blocked_after_timely_manifest`.
- AUDIT_VERIFIED: claim is permissionless and pays fixed parties, so it cannot be blocked by
  one side going offline.
- AUDIT_IN_PROGRESS is never persisted at rest: any consensus or re-verification failure
  reverts the whole write, leaving the shipment in MANIFEST_SUBMITTED.

## 3. Race conditions between competing transitions

Guards are mutually exclusive by status AND by timestamp:

- `accept_shipment_bid` needs `now < deadline`; `reclaim_expired_shipment` needs `now >= deadline`.
- `submit_delivery_manifest` needs `now < deadline`; reclaim of the same order is only possible
  at or after the deadline, so a timely manifest always wins the reclaim race.
- `audit` runs only from MANIFEST_SUBMITTED; `claim` only from AUDIT_VERIFIED; `reclaim` only
  from OPEN or CARRIER_ACCEPTED. No two of these share an entry status.
- GenLayer finalizes transactions sequentially under consensus, so an audit and a mutual
  release cannot interleave; the first one to settle moves the status to SETTLED and the other
  fails its status check. Each payout drains the vault, and terminal status blocks re-entry.

Proven by `test_reclaim_blocked_after_live_verification`, `test_claim_twice_reverts`,
`test_audit_rejects_second_live_run`, `test_reclaim_deadline_is_inclusive`.

## 4. Accounting invariant

Invariant, one line: `total_supply == sum_token_balances + vault_custody_balance`, and
`vault_custody_balance == sum of escrow locked in non-terminal shipments`, and every settled
band pays `carrier_payout + shipper_refund == freight_fee + carrier_bond`.

- Every credit/debit/lock/pay path preserves the first term exactly; `_pay_from_vault` refuses
  to underflow custody.
- All three bands conserve to the unit using integer fixed-point (fee in 6-decimal FPT, bps in
  integers, temperature in hundredths, transit in minutes). No float participates in a payout.
- `check_vault_invariants` recomputes and exposes every term; `test_vault_invariants_fail_if_escrow_is_wrong`
  proves the view actually goes red when escrow is tampered, and `test_pure_band_helper_conserves_all_three_bands`
  proves conservation for all three bands.

## 5. Input validation at every entry point

- Bill of lading: length 4 to 64 and `[A-Za-z0-9._-]` only. Route: length 3 to 120, no control chars.
- Temperature ceiling: -90 C to 60 C. Transit SLA: 1 h to 8760 h. Fee and bond: positive and capped.
- Deadline: bounded on both ends to 180 seconds and 180 days, so no window is unbounded.
- Manifest URL: https only, no port, no embedded credentials, no private or blocked hosts.
- Address coercion rejects non-20-byte and non-hex input; transfers to the zero address are refused.
- Amounts of zero or negative are rejected on faucet, transfer, create, and every bps argument.

## 6. Consensus safety

- The settlement amount is a pure function of the discrete band, which is decided by exact
  validator agreement on `fulfilment_band`, `customs_cleared` and `temp_breached`
  (`gl.eq_principle.prompt_comparative`). Numeric agreement is allowed only on the raw peak
  temperature (0.5 C) and transit (0.05 h), and never on anything that changes the payout.
  Because the band and breach booleans must match exactly, a value straddling a threshold
  produces NO_MAJORITY (fail closed), not a flipped payout.
- Settlement inputs come from the deterministic regex parse of the fetched manifest, not from a
  free-form model number. The model output is used only as a cross-check attestation that must
  agree with the deterministic outcome, otherwise the audit reverts.
- After consensus the contract re-derives the band from the consensus telemetry through the same
  `_compute_fulfilment_band` and re-verifies band, breach and customs before storing anything.
- Every validator and the leader fetch the URL independently inside the non-deterministic block.
  Unreachable or malformed evidence raises and reverts, so funds fail closed to the safe state.
- Prompt injection was tested, not assumed: `test_audit_settlement_ignores_injection_when_attestation_matches_manifest`
  shows an injected instruction line in the manifest does not change a correct settlement, and
  `test_audit_injection_cannot_flip_band_when_attestation_disobeys` shows a model that obeys the
  injection only causes a revert. A manipulated model can never move funds.

## 7. Consensus coverage caveat

The direct suite runs the leader path only. It does not by itself prove validator agreement.
Independent validator consensus is exercised live on studionet: `evidence/studionet_deployment.json`
records four audits (`FULL_ON_TIME_RELEASE`, `LATE_TRANSIT_PENALTY`, `COLD_CHAIN_SPOILAGE_SLASH`,
`FULL_ON_TIME_RELEASE`) all finalized with majority agreement, plus the two-party mutual release,
the timed reclaim and four guard reverts.

## Findings

- No owner, admin or steward bypass exists: `test_storage_has_no_owner_field` and
  `test_governance_boundary_has_no_owner_or_admin` assert the invariant, and only three
  settlement paths are present. FIXED.
- MANIFEST_SUBMITTED has no unilateral reclaim by design (protects the on-time carrier);
  liveness is guaranteed by permissionless audit plus mutual release. FIXED with tests above.
- `_now_seconds` falls back to wall clock only when the chain message omits `datetime`; on
  studionet the field is always present and the value is replayed identically by validators.
  Accepted, low risk, exercised through the deterministic path in the direct suite via the
  injected `gl.message_raw["datetime"]`.
- Nothing is currently OPEN.
