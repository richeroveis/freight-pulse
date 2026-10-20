# Demo video script

The rendered video is `docs/demo-video-subtitled.mp4`: 48 seconds, 1280x720, H.264 with AAC audio.
English subtitles are burned in. The soundtrack is synthesized by `tools/generate_soundtrack.py`,
and the picture is rendered frame by frame by `tools/generate_video.py`.

## Storyboard

| Time | Scene | Picture | Subtitle |
| --- | --- | --- | --- |
| 00:00 | Intro | Logo, pulse ring, wordmark, studionet badge | FreightPulse: AI-audited cold-chain fulfilment. |
| 00:03 | Intro | Vault and no-bypass chips | Shipper fees and carrier bonds are locked in a real FPT vault. |
| 00:07 | Escrow | Shipper fee card, carrier bond card, animated transfers into the vault | The freight fee enters custody the moment an order is created. |
| 00:10 | Escrow | Vault cylinder showing 259,000 FPT | The carrier locks its bond when it accepts the bid. |
| 00:13 | Consensus | Manifest panel with bill of lading and telemetry lines | Validators fetch the carrier manifest independently. |
| 00:17 | Consensus | Five validator nodes turn green, majority badge | They must agree on band, customs and temperature breach. |
| 00:20 | Bands | Three band cards with payouts and conservation bars | Full release, late penalty, or spoilage slash. |
| 00:23 | Bands | Active card cycles, 100 percent conserved | Every band conserves fee plus bond, to the unit. |
| 00:27 | Simulator | Sliders, split bar, on-chain verify chip | The what-if simulator shows the exact split before signing. |
| 00:31 | Simulator | Temperature rises past the ceiling, band flips | Move the temperature above the ceiling and the band flips. |
| 00:34 | Guards | Terminal shows three expected reverts, red line stamp | One signature never settles a mutual release. |
| 00:38 | Guards | Revert lines and no-owner stamp | A timely manifest blocks premature reclaim. No owner, no admin, no bypass. |
| 00:41 | Evidence | Four sha256 boxes, contract address, green checks | Four sha256 digests resolve to the same contract source. |
| 00:44 | Close | Logo, repository URL, studionet badge | FreightPulse. Built on GenLayer studionet. |

## Regenerate

```bash
.venv/bin/python tools/generate_logo.py
.venv/bin/python tools/generate_soundtrack.py
.venv/bin/python tools/generate_video.py
```

The video is gitignored on `main`. It is attached to the `studionet-v1` GitHub release.
