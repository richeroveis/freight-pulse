# FreightPulse

**AI-audited global cold-chain and maritime cargo fulfilment, settled by GenLayer validator consensus.**

FreightPulse is a production-grade GenLayer marketplace where shippers lock freight fees and
carriers lock performance bonds in a real on-chain FPT vault. A shipment is released only when
independent validators fetch the carrier's delivery manifest, agree on customs clearance, peak
cargo temperature and transit time, and derive a discrete fulfilment band. There is no owner,
admin or steward method that can move funds.

- Live contract: [`0x67D9ed75E65E646499013e9da65caace82c97eb9`](https://explorer-studio.genlayer.com/address/0x67D9ed75E65E646499013e9da65caace82c97eb9)
- Deploy tx: `0xa95f9b381dde640b73949c284df8a67d06148f12b1f4c8d01755f5fe85752d95`
- Network: GenLayer studionet, chain id `61999`
- Evidence: [`evidence/studionet_deployment.json`](evidence/studionet_deployment.json)
- Frontend: `https://richeroveis.github.io/freight-pulse/`

## Product

| Area | What it does |
| --- | --- |
| Cargo order desk | Shippers create a bill of lading with a temperature ceiling, transit SLA, freight fee, carrier bond and delivery deadline. The fee is debited into vault custody immediately. |
| Carrier bidding | A carrier accepts an open order by locking its bond into the same vault. The shipper cannot act as its own carrier. |
| Delivery manifest | The assigned carrier submits a public HTTPS telemetry manifest before the deadline. Private hosts, IP literals, credentials and non-HTTPS URLs are rejected. |
| Live fulfilment audit | Validators render the manifest, verify the bill of lading binding, extract customs status, peak temperature and transit hours, and must agree exactly on band, customs and breach flags. |
| Settlement claim | The vault pays the carrier and shipper by the settled band. Every path conserves `freight_fee + carrier_bond` exactly. |
| Mutual release | Shipper and carrier can co-sign a split. One signature never settles. The two stored bps values must match exactly. |
| Timed reclaim | If no carrier accepts, or the carrier misses the deadline without a timely manifest, the shipper recovers the fee and the forfeited bond. A timely manifest blocks reclaim while verification is pending. |
| Guard lab | Live probe buttons sign real studionet transactions that the contract must reject (non-HTTPS URL, temperature ceiling, bps ceiling), and read the revert reason back from the finalized receipt. |
| Control deck | Signed forms for every lifecycle write method: create order, accept bid, submit manifest, run live audit, claim settlement, propose mutual release from each party, timed reclaim and an FPT transfer. |

## Settlement bands

The single invariant helper `_compute_fulfilment_band` decides every band and split. Temperatures
are stored in hundredths of a degree Celsius and transit in minutes, so no float participates in
settlement.

| Band | Condition | Carrier | Shipper |
| --- | --- | --- | --- |
| `FULL_ON_TIME_RELEASE` | Customs cleared, peak temperature at or below ceiling, transit at or below SLA | 10000 bps of fee plus 100 percent bond refund | 0, slash 0 |
| `LATE_TRANSIT_PENALTY` | Customs cleared and cold chain intact, transit above SLA | 7000 bps of fee plus 100 percent bond refund | 3000 bps of fee, slash equals that refund |
| `COLD_CHAIN_SPOILAGE_SLASH` | Peak temperature above ceiling or customs rejected | 0 | 100 percent fee plus 100 percent bond as spoilage compensation |
| `MUTUAL_RELEASE_CO_SIGNED` | Identical shipper and carrier bps | bps share of fee plus bond | remainder of fee |
| `EXPIRED_RECLAIM` | Deadline missed with no timely manifest | 0, bond forfeited if locked | fee, plus bond if a carrier had accepted |

## Security properties

1. **No owner bypass.** The contract has no owner, admin, steward or emergency withdrawal method.
   `get_governance_boundary` returns the complete list of settlement paths.
2. **Funded escrow only.** Fees and bonds are debited from real FPT balances into
   `vault_custody_balance` before work starts. Payouts fail closed on vault underflow.
3. **Exact conservation.** `carrier_payout + shipper_refund == freight_fee + carrier_bond` for every
   settled shipment. `check_vault_invariants` also proves
   `sum_token_balances + vault_custody_balance == total_supply`.
4. **Consensus inside consensus.** The audit snapshots every input before `gl.nondet`, reserves the
   audit slot with `AUDIT_IN_PROGRESS`, requires exact agreement on `fulfilment_band`,
   `customs_cleared` and `temp_breached`, then re-runs the pure helper on-chain before writing.
5. **Fail-closed parsing.** Missing, ambiguous or non-numeric LLM fields raise a prefixed error
   instead of defaulting to a favourable band. A manifest that does not contain the bill of lading
   is rejected before any model call.
6. **Two-party release only.** `propose_mutual_release` records one signature per party, rejects
   outsiders, and settles only when both stored bps values are identical.
7. **Timed reclaim boundary.** Reclaim requires the shipper role and `now >= deadline`. It is blocked
   for `MANIFEST_SUBMITTED`, `AUDIT_IN_PROGRESS` and `AUDIT_VERIFIED`.
8. **Input floors and ceilings.** Deadline windows are bounded to 180 seconds and 180 days. Transit
   is bounded to 1 hour and 8760 hours. Temperatures are bounded to -90 C and 60 C. Fees and bonds
   are bounded and must be positive.
9. **Injection tested, not assumed.** Settlement reads the machine-readable manifest lines
   deterministically; the model attestation is only a cross-check that must agree or the audit
   reverts, so a manipulated model can fail closed but can never move funds.

The full state machine, liveness, race and invariant analysis is recorded in
[docs/security-review.md](docs/security-review.md).

## Repository layout

```text
contracts/freight_pulse.py          GenLayer Intelligent Contract, pinned runner
tests/test_freight_pulse_direct.py  95 direct mode tests
tests/conftest.py                   Windows unlink workaround and fixtures
scripts/deploy_studionet.py         resumable deploy, multi-signer seeding, evidence
frontend/                           React, TypeScript, Vite, Tailwind flagship UI
evidence/studionet_deployment.json  live transactions and 4-way sha256 identity
evidence/manifests/                 public telemetry manifests used by live audits
docs/                               architecture, evidence, logo and demo video
tools/                              logo, soundtrack and video generators
```

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/genvm-lint check contracts/freight_pulse.py
.venv/bin/python -m pytest tests/test_freight_pulse_direct.py -q
```

The direct suite covers vault conservation, all three consensus bands, mutual release, timed
reclaim boundaries, URL guards, fail-closed LLM parsing and bill of lading mismatch rejection.

## Deploy and seed

Create a project `.env` with `GENLAYER_PRIVATE_KEY`. Push the repository first so the public
manifests resolve on `raw.githubusercontent.com`, then run:

```bash
.venv/bin/python scripts/deploy_studionet.py --deploy-only
.venv/bin/python scripts/deploy_studionet.py
```

The script is resumable, funds seven burner signers, creates six shipments, runs carrier
acceptance, manifest submission, live validator audits, settlement claims, a two-party mutual
release, a timed reclaim and four expected guard reverts. It writes the committed evidence file
and an ignored checkpoint with burner keys.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The control tower keeps first paint under five RPC calls and uses `genlayer-js` read calls with no local ABI override. The control deck signs real lifecycle transactions in a burner wallet or through MetaMask with `writeContract`, waits for the receipt, shows the transaction hash and explorer link, polls the status to `FINALIZED`, and surfaces the contract revert message on failure. Every public write method is bound: `create_shipment_order`, `accept_shipment_bid`, `submit_delivery_manifest`, `audit_shipment_fulfilment_live`, `claim_shipment_settlement`, `propose_mutual_release`, `reclaim_expired_shipment`, `transfer_tokens` and `faucet_or_deposit`. Client-side forms mirror the contract floors and ceilings, including the 180 second to 180 day deadline window, 1 to 8760 hour transit, -90 to 60 C temperature and the positive bounded amounts. The guard lab buttons sign live transactions that are expected to revert and read the guard reason back from the finalized receipt. The what-if simulator is illustration only and its verify button reads the on-chain `simulate_settlement_split` view.

A CI step, `python scripts/check_frontend_bindings.py`, parses the contract public write methods and fails if any of them has no `writeContract` binding in the frontend, so the interface can never drift behind the contract again.

## Browser end-to-end proof

Every lifecycle action below was signed by the real built frontend (Playwright, burner wallet mode) against studionet, recorded in [`evidence/ui_flow_verification.json`](evidence/ui_flow_verification.json), verified through the explorer JSON API (FINALIZED plus the expected leader result) and read back from the contract in [`evidence/settlement_reads_verification.json`](evidence/settlement_reads_verification.json). Screenshots are in `evidence/screenshots/`. The driver is `tools/e2e_full_flow.mjs`; the verifiers are `scripts/verify_ui_flow.py` and `scripts/verify_settlement_reads.py`.

| Path | Browser steps | Verified outcome |
| --- | --- | --- |
| Audit and claim | shipper create, carrier accept, carrier submit a public manifest, carrier live audit, carrier claim | order SETTLED, band `FULL_ON_TIME_RELEASE`, carrier paid 2800 FPT, escrow conserved |
| Mutual release | shipper create, carrier accept, carrier co-sign 7000 bps, shipper co-sign 7000 bps | order SETTLED, band `MUTUAL_RELEASE_CO_SIGNED`, carrier 2200 FPT, shipper 600 FPT |
| Timed reclaim | shipper create at the shortest permitted deadline, nobody accepts, shipper reclaims after the deadline | order RECLAIMED, shipper fee 2000 FPT refunded |
| Guard and gating | untrusted manifest URL probe, and reclaim before the deadline | probe finalized with the leader reverting; the reclaim button was disabled with the deadline reason |

Not driven from the browser this round: MetaMask mode stays untested in headless runs (no wallet extension), and the FPT transfer button is bound and lint-covered but was not exercised live. The burners are funded for gas by `scripts/e2e_fund_burners.py`. The run used a same-origin RPC proxy (`tools/e2e_proxy.mjs`) only to absorb transient studionet rate limiting in the browser; it changes no contract behavior and is not part of the deployed app.

## Demo video

`docs/demo-video-subtitled.mp4` is a real screen recording of the built frontend driving the full lifecycle above against studionet in burner wallet mode, captured with Playwright and subtitled. It visibly shows the control deck forms, the live audit, the settlement claim, the two-party mutual release and the timed reclaim. The file is committed to the repository (whitelisted in `.gitignore`) and is served directly by the Pages build at `https://richeroveis.github.io/freight-pulse/demo-video-subtitled.mp4`, so no release attachment is required.

- sha256: `0097624da353c91af2984675c19718f5b010ae76239c92269fbfb24ab71b519a`

## License

MIT. See [LICENSE](LICENSE).
