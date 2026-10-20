# FreightPulse

**AI-audited global cold-chain and maritime cargo fulfilment, settled by GenLayer validator consensus.**

FreightPulse is a production-grade GenLayer marketplace where shippers lock freight fees and
carriers lock performance bonds in a real on-chain FPT vault. A shipment is released only when
independent validators fetch the carrier's delivery manifest, agree on customs clearance, peak
cargo temperature and transit time, and derive a discrete fulfilment band. There is no owner,
admin or steward method that can move funds.

- Live contract: `STUDIONET_CONTRACT_ADDRESS`
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
| Guard lab | One-click probes in the UI demonstrate unilateral release rejection, post-manifest reclaim rejection and untrusted URL rejection. |

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

## Repository layout

```text
contracts/freight_pulse.py          GenLayer Intelligent Contract, pinned runner
tests/test_freight_pulse_direct.py  87 direct mode tests
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

The control tower uses `genlayer-js` read calls without local ABI overrides and keeps first load
under five RPC calls. The what-if simulator mirrors `_compute_fulfilment_band` client-side and also
exposes the on-chain `simulate_settlement_split` view for verification.

## Demo video

`docs/demo-video-subtitled.mp4` is a 48 second, 1280x720, English-subtitled walkthrough with a
synthesized ambient soundtrack. Media files are gitignored on `main` and attached to the release
`studionet-v1`.

## License

MIT. See [LICENSE](LICENSE).
