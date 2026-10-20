# FreightPulse studionet evidence

Every row below is a studionet transaction that was polled to `FINALIZED` and read back
through the consensus data contract. The legacy explorer host was unavailable during the
run; the newer explorer frontend was reachable, but its JSON endpoint was not documented,
so the RPC receipt is the source of truth and the explorer links are provided for humans.

## Deployment

- Network: `studionet` chain id `61999`
- RPC: `https://studio.genlayer.com/api`
- Contract: `0x67D9ed75E65E646499013e9da65caace82c97eb9`
- Deploy transaction: [0xa95f9b381d...](https://explorer-studio.genlayer.com/transactions/0xa95f9b381dde640b73949c284df8a67d06148f12b1f4c8d01755f5fe85752d95)
- Git HEAD: `845e220d8b27209bb5554645861fbe4920028769`
- Main signer: `0x154a452b0755EE812014C1405B15D905BA06f9c7`
- Burner signers: 7
- Generated at: `2026-10-20T13:07:51Z`
- RPC pacing: 2.6s between calls, 0 rate limit retries, 0 transient retries

## 4-way sha256 identity

| Source | sha256 |
| --- | --- |
| Local contract file | `96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5` |
| Git blob at HEAD | `96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5` |
| Deploy payload | `96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5` |
| On-chain source | `96e5c244eee45982a70413b6ed9b1f79bfb8f5e2ccae1730f2a7a6887f08e0f5` |

All four match: **YES**.

The on-chain source was decoded from `gen_getContractCode` and hashed as UTF-8 text.
The deploy payload was decoded from the base64 `contract_code` field of the deploy
transaction receipt.

## Transactions

| # | Action | Transaction | Status | Execution | Consensus |
| --- | --- | --- | --- | --- | --- |
| 1 | deploy FreightPulse | [0xa95f9b381d...](https://explorer-studio.genlayer.com/transactions/0xa95f9b381dde640b73949c284df8a67d06148f12b1f4c8d01755f5fe85752d95) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 2 | faucet main | [0x4cdcd16939...](https://explorer-studio.genlayer.com/transactions/0x4cdcd169390b6e41da2ac0bb42373047580d8e0c1effcbb24c0b8ccc7ff298e7) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 3 | faucet carrier_gva | [0xfdd858cf4c...](https://explorer-studio.genlayer.com/transactions/0xfdd858cf4c9a7b92de4572d0762f9499b54b6747a8e2cff8e8837cb762b41af6) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 4 | faucet shipper_rtm | [0x63ee9fc1ac...](https://explorer-studio.genlayer.com/transactions/0x63ee9fc1acebd86957bd60a1a88f7706103f2ee43ca70729dea34c9f1ccd3c90) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 5 | faucet carrier_rtm | [0x3f91c1564c...](https://explorer-studio.genlayer.com/transactions/0x3f91c1564c68f2fae590f554f23abc39c4f92019962417a02390a989db089104) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 6 | faucet shipper_osl | [0xf5ba5cefd3...](https://explorer-studio.genlayer.com/transactions/0xf5ba5cefd32e1c50f1bd05ccf9c9d81d51db4a6053db19997a2ae1e6f645bb23) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 7 | faucet carrier_osl | [0x10d348b749...](https://explorer-studio.genlayer.com/transactions/0x10d348b7493086698b6439e76a81d342ea276731f8170cace852e54f27ac6a2b) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 8 | faucet carrier_dxb | [0x890663fabd...](https://explorer-studio.genlayer.com/transactions/0x890663fabd86af48e4cc4d5d57bf21bfaf9b11f5c7d0c417b2527f17e42b27e5) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 9 | faucet carrier_lax | [0xe922ce9945...](https://explorer-studio.genlayer.com/transactions/0xe922ce994596a9cc9487a7358cd1cf12d61bba8c5b5f0641cc62b66b417f7c20) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 10 | create gva_sin_biologics | [0x5cc16940f8...](https://explorer-studio.genlayer.com/transactions/0x5cc16940f865f30fbf13b873e257e8e8bdda40a5be9d39cc96662b9def871975) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 11 | create rtm_tyo_photoresist | [0x9da0022a48...](https://explorer-studio.genlayer.com/transactions/0x9da0022a48c9d0aa04e8c5e0019da06706ad36e7554d557fee471a7893f35606) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 12 | create osl_nyc_seafood | [0xbbd89ad2e0...](https://explorer-studio.genlayer.com/transactions/0xbbd89ad2e0ae467d77e5bfbb9f03ef5eb398bb72355fb6fc6c2a3d688bd745c1) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 13 | create gva_dxb_mutual | [0x5afd974548...](https://explorer-studio.genlayer.com/transactions/0x5afd974548de56692d8033a6ffa6cd035fbfb09a8c5b9f031967e2fe75bec691) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 14 | create lax_bcn_aerospace | [0x3da8a5788c...](https://explorer-studio.genlayer.com/transactions/0x3da8a5788c022bd4afa040ba19aa8ff5cc0ce637d523f4066675504f14eb570c) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 15 | create sin_ham_abandoned | [0xe029561126...](https://explorer-studio.genlayer.com/transactions/0xe0295611267074f0c6240c1dcb09ae987ee4daa2fd545f7016193d0557314fe9) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 16 | accept gva_sin | [0x42f204f1b5...](https://explorer-studio.genlayer.com/transactions/0x42f204f1b56600c00f1593b7eb7bcfdfa72262d0625bd85697ee7dca87cee62a) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 17 | accept rtm_tyo | [0x40041dfbf7...](https://explorer-studio.genlayer.com/transactions/0x40041dfbf75217dee838c538ebd31a092f99c080a1f97b7bd54405db059e23ba) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 18 | accept osl_nyc | [0xe9b5084de8...](https://explorer-studio.genlayer.com/transactions/0xe9b5084de8bf1b0f5db719102dac893fe65d5a95e0f66da6c3971a77f229c6f5) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 19 | accept gva_dxb | [0x60a1b845e6...](https://explorer-studio.genlayer.com/transactions/0x60a1b845e644845f02139f909dad748320aa81ac1c1d08a53a03497693a44e4e) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 20 | accept lax_bcn | [0xd1316b8985...](https://explorer-studio.genlayer.com/transactions/0xd1316b898550e02a5f8a0c14ca59f2f13f00f96e0825154240190f739198a224) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 21 | guard untrusted manifest URL | [0xcdcaaca8ce...](https://explorer-studio.genlayer.com/transactions/0xcdcaaca8cea80b57d4654bee8577fca7f97a3097c5cbf0fd7c2399fe21dbe4f1) | FINALIZED | FINISHED_WITH_ERROR | MAJORITY_AGREE |
| 22 | manifest gva_sin_biologics | [0x5d1f3adf5e...](https://explorer-studio.genlayer.com/transactions/0x5d1f3adf5e7b0bb760964b21e520a4ef0c8da3b76aa0d18e67cbaea63b60daeb) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 23 | manifest rtm_tyo_photoresist | [0x8ca63f7d2f...](https://explorer-studio.genlayer.com/transactions/0x8ca63f7d2f0c92e04508834d211f20e2c769773fec3621e40d3ac9555d4586a5) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 24 | manifest osl_nyc_seafood | [0xbeb1d285be...](https://explorer-studio.genlayer.com/transactions/0xbeb1d285be0450c3316f755458da6d4a3ebb5e99eca2956b4e323dd7719eda4d) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 25 | manifest lax_bcn_aerospace | [0xa079e9959b...](https://explorer-studio.genlayer.com/transactions/0xa079e9959b4a2d477d9f187f22f9ee8e5966f3380b8e9e97fc561aab1d060a50) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 26 | guard premature reclaim after manifest | [0x73d65da170...](https://explorer-studio.genlayer.com/transactions/0x73d65da17044344bc005725a9f9efc9ec7335d8bbce9a5711348662e2b942781) | FINALIZED | FINISHED_WITH_ERROR | MAJORITY_AGREE |
| 27 | guard claim before live audit | [0x507a668f9c...](https://explorer-studio.genlayer.com/transactions/0x507a668f9c5608bd1ebe6dcca5f7fa2651136b9e50e87756ec623397c525f5c6) | FINALIZED | FINISHED_WITH_ERROR | MAJORITY_AGREE |
| 28 | audit gva_sin | [0xbc18f277c6...](https://explorer-studio.genlayer.com/transactions/0xbc18f277c682eee0235d4d8301ff7a9fb61c5826daac1c45e68d51403dfb56ec) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 29 | audit rtm_tyo | [0x72e3f64442...](https://explorer-studio.genlayer.com/transactions/0x72e3f64442d5b015e77fbeeb996d249e070d3948959cf41d1815bea81433d8d0) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 30 | audit osl_nyc | [0xca523f557e...](https://explorer-studio.genlayer.com/transactions/0xca523f557ee2523218bab115f7017b32ee3e2ab63bbf7777293f0aa9293c5072) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 31 | audit lax_bcn | [0x90cba23d1d...](https://explorer-studio.genlayer.com/transactions/0x90cba23d1dd071979e4feb4b9241ce115a37dc4e69a9383f384555309713382c) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 32 | claim gva_sin | [0x86ea647f39...](https://explorer-studio.genlayer.com/transactions/0x86ea647f391eebc61d0d112bbdbb1d70367034c6c5ce2c80ccbe9a71da75fbfa) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 33 | claim rtm_tyo | [0xee07d5d259...](https://explorer-studio.genlayer.com/transactions/0xee07d5d259f9090f694eae87a482f9d9a7315ac26a4ce83f1ccc4e45c7c0b52b) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 34 | claim osl_nyc | [0x00cfc3e1b9...](https://explorer-studio.genlayer.com/transactions/0x00cfc3e1b922d87205e81001c926d7c48a9497acad19297763f762f587b26ead) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 35 | claim lax_bcn | [0x864c374d64...](https://explorer-studio.genlayer.com/transactions/0x864c374d647b9e8ce3656ececd7503c01a1da2047acb20fa1b6dc903b0832bae) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 36 | mutual release shipper signature | [0x5915d17925...](https://explorer-studio.genlayer.com/transactions/0x5915d179258119e58c879e4f2a6262de480d8368ecd8be411f57ab4b2387e088) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 37 | guard unilateral mutual release | [0xeeb31ffbac...](https://explorer-studio.genlayer.com/transactions/0xeeb31ffbac32438cfd99f27309c177d84d16e49d1d170baaab253723d6d27b04) | FINALIZED | FINISHED_WITH_ERROR | MAJORITY_AGREE |
| 38 | mutual release carrier countersignature | [0xc681f631a1...](https://explorer-studio.genlayer.com/transactions/0xc681f631a16e8c591b173d18989351db4b0ffd21086f4322007e8d28cc0ffc94) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 39 | reclaim abandoned shipment | [0xfb52091b77...](https://explorer-studio.genlayer.com/transactions/0xfb52091b77c91234a03a7db035f22453951eb57e3dd046a1be3a638d08bf362e) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |
| 40 | transfer FPT carrier to shipper | [0x4e19348362...](https://explorer-studio.genlayer.com/transactions/0x4e19348362a260599099a6693a9f40f4abde24acb118ad5cc939ff03a325fac3) | FINALIZED | FINISHED_WITH_RETURN | MAJORITY_AGREE |

## Expected guard reverts

| Probe | Transaction | Revert payload |
| --- | --- | --- |
| guard untrusted manifest URL | [0xcdcaaca8ce...](https://explorer-studio.genlayer.com/transactions/0xcdcaaca8cea80b57d4654bee8577fca7f97a3097c5cbf0fd7c2399fe21dbe4f1) | `[EXPECTED] manifest URL must use https` |
| guard premature reclaim after manifest | [0x73d65da170...](https://explorer-studio.genlayer.com/transactions/0x73d65da17044344bc005725a9f9efc9ec7335d8bbce9a5711348662e2b942781) | `[EXPECTED] manifest was submitted on time, reclaim is blocked pending verification` |
| guard claim before live audit | [0x507a668f9c...](https://explorer-studio.genlayer.com/transactions/0x507a668f9c5608bd1ebe6dcca5f7fa2651136b9e50e87756ec623397c525f5c6) | `[EXPECTED] shipment has no consensus verdict to claim` |
| guard unilateral mutual release | [0xeeb31ffbac...](https://explorer-studio.genlayer.com/transactions/0xeeb31ffbac32438cfd99f27309c177d84d16e49d1d170baaab253723d6d27b04) | `[EXPECTED] only the shipper or the carrier can co-sign` |

## Final state

- Vault custody: `0 FPT`
- Locked escrow: `0 FPT`
- Sum of token balances: `16,000,000 FPT`
- Total supply: `16,000,000 FPT`
- Vault equals escrow: **True**
- Supply equals balances plus vault: **True**
- Every settled band conserves fee plus bond: **True**
- Combined invariant: **PASS**

### Shipments

| # | Bill of lading | Route | Status | Band | Fee | Bond | Carrier | Shipper |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BOL-GVA-SIN-77 | Geneva to Singapore Biologics Air Freight | SETTLED | FULL_ON_TIME_RELEASE | `185,000 FPT` | `74,000 FPT` | `259,000 FPT` | `0 FPT` |
| 2 | BOL-RTM-TYO-42 | Rotterdam to Tokyo Semiconductor Photoresist | SETTLED | LATE_TRANSIT_PENALTY | `240,000 FPT` | `96,000 FPT` | `264,000 FPT` | `72,000 FPT` |
| 3 | BOL-OSL-NYC-19 | Oslo to New York Cold-Chain Seafood | SETTLED | COLD_CHAIN_SPOILAGE_SLASH | `150,000 FPT` | `60,000 FPT` | `0 FPT` | `210,000 FPT` |
| 4 | BOL-GVA-DXB-31 | Geneva to Dubai Pharmaceutical Transshipment | SETTLED | MUTUAL_RELEASE_CO_SIGNED | `120,000 FPT` | `48,000 FPT` | `150,000 FPT` | `18,000 FPT` |
| 5 | BOL-LAX-BCN-55 | Los Angeles to Barcelona Aerospace Adhesives | SETTLED | FULL_ON_TIME_RELEASE | `95,000 FPT` | `38,000 FPT` | `133,000 FPT` | `0 FPT` |
| 6 | BOL-SIN-HAM-08 | Singapore to Hamburg Frozen Tuna | RECLAIMED | EXPIRED_RECLAIM | `80,000 FPT` | `32,000 FPT` | `0 FPT` | `80,000 FPT` |

### Signer balances

| Role | Address | FPT | GEN wei |
| --- | --- | --- | --- |
| main | `0x154a452b0755EE812014C1405B15D905BA06f9c7` | `1,620,500 FPT` | `117520000000000000000` |
| carrier_gva | `0xE99d8e8De0d1920D9200656978b6911224ba38Bd` | `2,182,500 FPT` | `3000000000000000000` |
| shipper_rtm | `0xBB9670c154f6e6Ae377D3b3e0Db298c9ED2407bc` | `1,832,000 FPT` | `3000000000000000000` |
| carrier_rtm | `0x2d85172c45778A61e4c1046b475AEfa4004Afdf2` | `2,168,000 FPT` | `3000000000000000000` |
| shipper_osl | `0x71861C828eD285C573FA0F33cBe83199587B24E0` | `2,060,000 FPT` | `3000000000000000000` |
| carrier_osl | `0xE78E332B2AEECD8e0a11f6b3087C84c1629Db78D` | `1,940,000 FPT` | `3000000000000000000` |
| carrier_dxb | `0x2Ca085AA1BEC8E998c481FE0f7ECBa3DA52c4c8f` | `2,102,000 FPT` | `3000000000000000000` |
| carrier_lax | `0xc91d8451d4AA4F8Bd93a6249d325890c1CEdc9f7` | `2,095,000 FPT` | `3000000000000000000` |

## Notes

- The direct mode suite covers the same bands, conservation checks, mutual release and
  reclaim boundaries without a server. See `tests/test_freight_pulse_direct.py`.
- The live audits exercise validator agreement, real web rendering and the model call. The
  deterministic manifest parser is the settlement source; the model must agree with its
  outcome before the band is written.
- Explorer links use `explorer-studio.genlayer.com`. The deployment was verified through the
  RPC consensus data contract because the legacy explorer JSON host was paused.
