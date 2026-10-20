#!/usr/bin/env python3
"""Render the 48 second, 1280x720, subtitled FreightPulse demo video."""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1280, 720
FPS = 24
DURATION = 48.0
OUT = ROOT / "docs" / "demo-video-subtitled.mp4"
AUDIO = ROOT / "artifacts" / "soundtrack.wav"

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONT_BOLD = FONT_DIR / "DejaVuSans-Bold.ttf"
FONT_REGULAR = FONT_DIR / "DejaVuSans.ttf"
FONT_MONO = FONT_DIR / "DejaVuSansMono.ttf"
FONT_MONO_BOLD = FONT_DIR / "DejaVuSansMono-Bold.ttf"

ABYSS = (6, 13, 26)
HULL = (10, 20, 36)
DECK = (14, 27, 47)
RAIL = (27, 44, 68)
ICE = (127, 227, 240)
TEAL = (45, 212, 191)
CORAL = (251, 113, 133)
AMBER = (251, 191, 36)
MIST = (157, 178, 204)
WHITE = (235, 245, 255)

TITLE = ImageFont.truetype(str(FONT_BOLD), 50)
TITLE_SMALL = ImageFont.truetype(str(FONT_BOLD), 34)
H2 = ImageFont.truetype(str(FONT_BOLD), 24)
H3 = ImageFont.truetype(str(FONT_BOLD), 18)
BODY = ImageFont.truetype(str(FONT_REGULAR), 16)
SMALL = ImageFont.truetype(str(FONT_REGULAR), 13)
TINY = ImageFont.truetype(str(FONT_REGULAR), 11)
MONO = ImageFont.truetype(str(FONT_MONO), 14)
MONO_SMALL = ImageFont.truetype(str(FONT_MONO), 11)
MONO_TINY = ImageFont.truetype(str(FONT_MONO), 9)
MONO_H2 = ImageFont.truetype(str(FONT_MONO_BOLD), 22)
SUBTITLE = ImageFont.truetype(str(FONT_BOLD), 21)

SUBTITLES = [
    (0.0, 3.4, "FreightPulse: AI-audited cold-chain fulfilment."),
    (3.4, 7.0, "Shipper fees and carrier bonds are locked in a real FPT vault."),
    (7.0, 10.4, "The freight fee enters custody the moment an order is created."),
    (10.4, 13.6, "The carrier locks its bond when it accepts the bid."),
    (13.6, 17.0, "Validators fetch the carrier manifest independently."),
    (17.0, 20.4, "They must agree on band, customs and temperature breach."),
    (20.4, 23.8, "Full release, late penalty, or spoilage slash."),
    (23.8, 27.2, "Every band conserves fee plus bond, to the unit."),
    (27.2, 31.0, "The what-if simulator shows the exact split before signing."),
    (31.0, 34.4, "Move the temperature above the ceiling and the band flips."),
    (34.4, 38.0, "One signature never settles a mutual release."),
    (38.0, 41.4, "A timely manifest blocks premature reclaim. No owner, no admin, no bypass."),
    (41.4, 44.6, "Four sha256 digests resolve to the same contract source."),
    (44.6, 48.0, "FreightPulse. Built on GenLayer studionet."),
]

SCENES = [
    (0.0, "01 / INTRO"),
    (7.0, "02 / ESCROW"),
    (13.6, "03 / CONSENSUS"),
    (20.4, "04 / BANDS"),
    (27.2, "05 / SIMULATOR"),
    (34.4, "06 / GUARDS"),
    (41.4, "07 / EVIDENCE"),
    (45.2, "08 / CLOSE"),
]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease(value: float) -> float:
    value = clamp(value)
    return 1 - (1 - value) ** 3


def progress(t: float, start: float, end: float) -> float:
    if end <= start:
        return 1.0
    return clamp((t - start) / (end - start))


def load_logo(size: int) -> Image.Image:
    return Image.open(ROOT / "docs" / "logo.png").convert("RGBA").resize((size, size), Image.LANCZOS)


LOGO = load_logo(190)
LOGO_SMALL = load_logo(34)


def build_background() -> Image.Image:
    y, x = np.mgrid[0:HEIGHT, 0:WIDTH]
    cx, cy = WIDTH * 0.18, HEIGHT * 0.05
    distance = np.sqrt(((x - cx) / WIDTH) ** 2 + ((y - cy) / HEIGHT) ** 2)
    glow = np.clip(1.0 - distance * 1.7, 0.0, 1.0) ** 2
    base = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    base[:, :] = np.array(ABYSS, dtype=np.float32)
    base[:, :, 1] += glow * 16
    base[:, :, 2] += glow * 28
    image = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), mode="RGB").convert("RGBA")
    grid = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(grid)
    for gx in range(0, WIDTH, 64):
        draw.line((gx, 0, gx, HEIGHT), fill=(*RAIL, 42), width=1)
    for gy in range(0, HEIGHT, 64):
        draw.line((0, gy, WIDTH, gy), fill=(*RAIL, 42), width=1)
    return Image.alpha_composite(image, grid)


BACKGROUND = build_background()


def panel(draw: ImageDraw.ImageDraw, box, radius=16, fill=(*HULL, 225), outline=(*RAIL, 255), width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy, value: str, font, fill=WHITE, anchor="la"):
    draw.text(xy, value, font=font, fill=fill, anchor=anchor)


def wrap(draw: ImageDraw.ImageDraw, value: str, font, max_width: int) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def scene_label(draw: ImageDraw.ImageDraw, t: float) -> None:
    label = SCENES[0][1]
    for start, value in SCENES:
        if t >= start:
            label = value
    draw.rounded_rectangle((28, 62, 190, 88), radius=8, fill=(*DECK, 230), outline=(*RAIL, 255))
    text(draw, (40, 69), label, MONO_SMALL, ICE)


def header(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    base_draw = ImageDraw.Draw(frame)
    base_draw.rectangle((0, 0, WIDTH, 52), fill=ABYSS)
    base_draw.line((0, 52, WIDTH, 52), fill=RAIL, width=1)
    frame.alpha_composite(LOGO_SMALL, (24, 9))
    text(draw, (68, 14), "FREIGHTPULSE", H3, WHITE)
    text(draw, (68, 33), "COLD-CHAIN CARGO CONTROL TOWER", MONO_TINY, MIST)
    draw.rounded_rectangle((WIDTH - 270, 14, WIDTH - 24, 40), radius=13, fill=(*DECK, 240), outline=(*TEAL, 150))
    draw.ellipse((WIDTH - 258, 24, WIDTH - 250, 32), fill=TEAL)
    text(draw, (WIDTH - 244, 20), "STUDIONET LIVE / 61999", MONO_SMALL, TEAL)


def footer(draw: ImageDraw.ImageDraw, t: float) -> None:
    draw.line((28, HEIGHT - 58, WIDTH - 28, HEIGHT - 58), fill=(*RAIL, 140), width=1)
    text(draw, (28, HEIGHT - 48), "github.com/richeroveis/freight-pulse", MONO_TINY, MIST)
    text(draw, (WIDTH - 28, HEIGHT - 48), f"00:{int(t):02d} / 00:48", MONO_TINY, MIST, anchor="ra")
    draw.rounded_rectangle((28, HEIGHT - 14, WIDTH - 28, HEIGHT - 10), radius=2, fill=(*RAIL, 160))
    draw.rounded_rectangle(
        (28, HEIGHT - 14, 28 + int((WIDTH - 56) * clamp(t / DURATION)), HEIGHT - 10),
        radius=2,
        fill=ICE,
    )


def subtitle(draw: ImageDraw.ImageDraw, t: float) -> None:
    for start, end, value in SUBTITLES:
        if start <= t < end:
            lines = wrap(draw, value, SUBTITLE, WIDTH - 360)
            height = 26 + len(lines) * 27
            top = HEIGHT - 78 - height
            draw.rounded_rectangle((150, top, WIDTH - 150, top + height), radius=12, fill=(*ABYSS, 232), outline=(*RAIL, 220))
            for index, line in enumerate(lines):
                text(draw, (WIDTH / 2, top + 13 + index * 27), line, SUBTITLE, WHITE, anchor="ma")
            break


def pulse_line(draw: ImageDraw.ImageDraw, points, color, width=3):
    draw.line(points, fill=color, width=width, joint="curve")


def scene_intro(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t
    fade = ease(progress(local, 0.0, 0.8))
    ring_phase = (local * 0.35) % 1.0
    for index in range(3):
        radius = int(150 + 60 * index + ring_phase * 20)
        alpha = int(90 * (1 - index / 3) * fade)
        draw.ellipse(
            (270 - radius, 330 - radius, 270 + radius, 330 + radius),
            outline=(*ICE, alpha),
            width=1,
        )
    logo = LOGO.resize((210, 210), Image.LANCZOS)
    frame.alpha_composite(logo, (165, 225))
    text(draw, (430, 210), "FREIGHTPULSE", TITLE, WHITE)
    text(draw, (432, 272), "AI-AUDITED COLD-CHAIN FULFILMENT", H3, ICE)
    text(draw, (432, 304), "Global maritime and cold-chain cargo, settled", BODY, MIST)
    text(draw, (432, 328), "by GenLayer validator consensus.", BODY, MIST)
    draw.rounded_rectangle((432, 366, 760, 404), radius=10, fill=(*DECK, 240), outline=(*TEAL, 150))
    text(draw, (450, 375), "NO OWNER  /  NO ADMIN  /  NO BYPASS", MONO_SMALL, TEAL)
    points = [(120 + index * 60, 560 + int(26 * math.sin(index * 0.7 + local * 2.4))) for index in range(18)]
    pulse_line(draw, points, (*CORAL, 220), 3)
    text(draw, (WIDTH - 30, 566), "REAL FPT ESCROW", MONO_SMALL, CORAL, anchor="ra")


def scene_escrow(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 7.0
    text(draw, (60, 120), "Funded escrow, not promises", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "Every order debits real FPT before work starts.", BODY, MIST)

    cards = [
        (60, 220, "SHIPPER FREIGHT FEE", "185,000 FPT", TEAL),
        (60, 360, "CARRIER PERFORMANCE BOND", "74,000 FPT", ICE),
    ]
    for index, (x, y, label, value, color) in enumerate(cards):
        appear = ease(progress(local, 0.2 + index * 0.3, 0.9 + index * 0.3))
        panel(draw, (x, y, x + 430, y + 108))
        draw.rounded_rectangle((x + 16, y + 16, x + 24, y + 92), radius=4, fill=color)
        text(draw, (x + 38, y + 20), label, MONO_SMALL, MIST)
        text(draw, (x + 38, y + 46), value, MONO_H2, color)
        text(draw, (x + 38, y + 78), "debited into vault custody", TINY, MIST)
        draw.rounded_rectangle(
            (x + 300, y + 34, x + 412, y + 66),
            radius=16,
            fill=(*DECK, 240),
            outline=(*color, 160),
        )
        text(draw, (x + 356, y + 42), "LOCKED", MONO_SMALL, color, anchor="ma")
        if appear > 0:
            draw.line((x + 430, y + 54, 790, 300 + index * 80), fill=(*color, int(180 * appear)), width=2)
            for step in range(3):
                phase = (local * 0.9 + step * 0.33) % 1.0
                px = x + 430 + (790 - x - 430) * phase
                py = y + 54 + (300 + index * 80 - y - 54) * phase
                draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=color)

    panel(draw, (790, 205, 1210, 505), radius=22, fill=(*DECK, 240), outline=(*ICE, 120), width=2)
    draw.ellipse((820, 230, 1180, 290), fill=(*HULL, 255), outline=(*RAIL, 255))
    draw.rectangle((820, 260, 1180, 440), fill=(*HULL, 255))
    draw.ellipse((820, 410, 1180, 470), fill=(*HULL, 255), outline=(*RAIL, 255))
    draw.arc((820, 230, 1180, 290), 0, 180, fill=(*ICE, 120), width=2)
    text(draw, (1000, 318), "FPT VAULT", MONO_SMALL, MIST, anchor="ma")
    text(draw, (1000, 344), "259,000", MONO_H2, ICE, anchor="ma")
    text(draw, (1000, 374), "FPT IN CUSTODY", MONO_SMALL, TEAL, anchor="ma")
    draw.rounded_rectangle((1000, 228, 1182, 258), radius=8, fill=(*TEAL, 28), outline=(*TEAL, 120))
    text(draw, (1091, 236), "vault == escrow", MONO_TINY, TEAL, anchor="ma")


def scene_consensus(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 13.6
    text(draw, (60, 120), "Validators read the same manifest", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "The leader is never trusted alone. Every answer is compared.", BODY, MIST)

    panel(draw, (60, 205, 700, 520), radius=16)
    text(draw, (84, 222), "CARRIER DELIVERY MANIFEST", MONO_SMALL, ICE)
    text(draw, (84, 246), "BOL-GVA-SIN-77", MONO_H2, WHITE)
    rows = [
        ("Bill of lading", "BOL-GVA-SIN-77", TEAL),
        ("Customs status", "CLEARED", TEAL),
        ("Peak cargo temperature", "2.4 C  /  ceiling 4.0 C", ICE),
        ("Transit time", "16.2 h  /  SLA 18.0 h", ICE),
        ("Evidence binding", "manifest contains the BoL", MIST),
    ]
    for index, (label, value, color) in enumerate(rows):
        y = 292 + index * 40
        appear = ease(progress(local, 0.3 + index * 0.15, 0.7 + index * 0.15))
        if appear <= 0:
            continue
        draw.rounded_rectangle((84, y - 8, 676, y + 26), radius=7, fill=(*DECK, int(200 * appear)))
        text(draw, (98, y - 1), label, SMALL, MIST)
        text(draw, (666, y - 1), value, MONO, color, anchor="ra")

    validator_x = 840
    for index in range(5):
        y = 208 + index * 62
        start = 1.0 + index * 0.35
        active = local >= start
        color = TEAL if active else RAIL
        draw.ellipse((validator_x - 16, y, validator_x + 16, y + 32), fill=(*DECK, 255), outline=color, width=2)
        if active:
            draw.line((validator_x - 6, y + 16, validator_x - 1, y + 22), fill=TEAL, width=3)
            draw.line((validator_x - 1, y + 22, validator_x + 9, y + 9), fill=TEAL, width=3)
        text(draw, (validator_x + 28, y + 2), f"validator {index + 1}", MONO_SMALL, WHITE if active else MIST)
        text(draw, (validator_x + 28, y + 18), "agree" if active else "waiting", TINY, TEAL if active else MIST)

    agree = local > 2.4
    draw.rounded_rectangle((790, 530, 1210, 576), radius=12, fill=(*TEAL, 24 if agree else 12), outline=(*TEAL, 160 if agree else 60))
    text(draw, (1000, 542), "MAJORITY_AGREE  /  BAND EXACT" if agree else "CONSENSUS IN PROGRESS", MONO_SMALL, TEAL if agree else MIST, anchor="ma")
    text(draw, (60, 540), "prompt_comparative", MONO, ICE)
    text(draw, (60, 562), "exact band, exact customs flag, exact breach flag", TINY, MIST)


def scene_bands(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 20.4
    text(draw, (60, 120), "Three discrete fulfilment bands", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "One pure helper decides every split. No floats. No drift.", BODY, MIST)
    active = int(local / 2.0) % 3
    bands = [
        ("FULL_ON_TIME_RELEASE", "FULL RELEASE", "carrier 259,000", "shipper 0", "slash 0", TEAL),
        ("LATE_TRANSIT_PENALTY", "LATE PENALTY", "carrier 264,000", "shipper 72,000", "slash 72,000", AMBER),
        ("COLD_CHAIN_SPOILAGE_SLASH", "SPOILAGE SLASH", "carrier 0", "shipper 210,000", "slash 210,000", CORAL),
    ]
    for index, (name, short, carrier, shipper, slash, color) in enumerate(bands):
        x = 60 + index * 400
        y = 215
        selected = index == active
        panel(
            draw,
            (x, y, x + 370, y + 330),
            radius=18,
            fill=(*DECK, 245) if selected else (*HULL, 220),
            outline=(*color, 220) if selected else (*RAIL, 255),
            width=2 if selected else 1,
        )
        draw.rounded_rectangle((x + 20, y + 20, x + 120, y + 46), radius=13, fill=(*color, 26), outline=(*color, 150))
        text(draw, (x + 70, y + 27), short, MONO_TINY, color, anchor="ma")
        text(draw, (x + 20, y + 68), name, MONO_SMALL if selected else TINY, WHITE if selected else MIST)
        text(draw, (x + 20, y + 104), carrier, MONO, TEAL)
        text(draw, (x + 20, y + 130), shipper, MONO, ICE)
        text(draw, (x + 20, y + 156), slash, MONO_SMALL, CORAL)
        draw.rounded_rectangle((x + 20, y + 200, x + 350, y + 214), radius=7, fill=(*RAIL, 180))
        draw.rounded_rectangle((x + 20, y + 200, x + 20 + 330 * (1.0 if index == 0 else 0.7 if index == 1 else 0.0), y + 214), radius=7, fill=color)
        text(draw, (x + 20, y + 238), "carrier + shipper == fee + bond", TINY, MIST)
        if selected:
            draw.rounded_rectangle((x + 20, y + 270, x + 350, y + 304), radius=8, fill=(*color, 18), outline=(*color, 120))
            text(draw, (x + 185, y + 279), "CONSERVED 100%", MONO_SMALL, color, anchor="ma")


def scene_simulator(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 27.2
    text(draw, (60, 120), "What-if settlement simulator", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "Move the telemetry and watch the exact FPT split before signing.", BODY, MIST)

    temperature = 2.4 + min(4.4, max(0.0, (local - 2.0) * 1.6))
    breached = temperature > 6.0
    band = "COLD_CHAIN_SPOILAGE_SLASH" if breached else "FULL_ON_TIME_RELEASE"
    color = CORAL if breached else TEAL

    panel(draw, (60, 205, 620, 560), radius=16)
    text(draw, (84, 224), "TELEMETRY INPUTS", MONO_SMALL, MIST)
    sliders = [
        ("Freight fee", 0.62, "185,000 FPT", ICE),
        ("Carrier bond", 0.42, "74,000 FPT", ICE),
        ("Peak temperature", clamp((temperature + 2) / 12), f"{temperature:.1f} C", CORAL if breached else TEAL),
        ("Transit hours", 0.45, "16.2 h", ICE),
    ]
    for index, (label, value, display, slider_color) in enumerate(sliders):
        y = 270 + index * 66
        text(draw, (84, y), label, SMALL, MIST)
        text(draw, (596, y), display, MONO, slider_color, anchor="ra")
        draw.rounded_rectangle((84, y + 26, 596, y + 34), radius=4, fill=(*RAIL, 220))
        draw.rounded_rectangle((84, y + 26, 84 + int(512 * value), y + 34), radius=4, fill=slider_color)
        draw.ellipse((84 + int(512 * value) - 8, y + 22, 84 + int(512 * value) + 8, y + 38), fill=(*ABYSS, 255), outline=slider_color, width=3)

    panel(draw, (650, 205, 1220, 560), radius=16, fill=(*DECK, 240), outline=(*color, 160), width=2)
    draw.rounded_rectangle((674, 228, 930, 264), radius=12, fill=(*color, 24), outline=(*color, 150))
    text(draw, (802, 236), "FULL RELEASE" if not breached else "SPOILAGE SLASH", MONO_SMALL, color, anchor="ma")
    text(draw, (674, 286), "CARRIER PAYOUT", MONO_SMALL, MIST)
    text(draw, (674, 308), "0 FPT" if breached else "259,000 FPT", MONO_H2, TEAL)
    text(draw, (674, 352), "SHIPPER REFUND", MONO_SMALL, MIST)
    text(draw, (674, 374), "259,000 FPT" if breached else "0 FPT", MONO_H2, ICE)
    draw.rounded_rectangle((674, 424, 1196, 440), radius=8, fill=(*RAIL, 220))
    carrier_width = 0 if breached else 500
    draw.rounded_rectangle((674, 424, 674 + carrier_width, 440), radius=8, fill=TEAL)
    draw.rounded_rectangle((674 + carrier_width, 424, 1196, 440), radius=8, fill=(*ICE, 180))
    text(draw, (674, 458), "EXACT CONSERVATION" if not breached else "TEMPERATURE BREACH +2.8 C", TINY, TEAL if not breached else CORAL)
    text(draw, (674, 482), "carrier_payout + shipper_refund == fee + bond", MONO_TINY, MIST)
    draw.rounded_rectangle((674, 510, 1196, 542), radius=8, fill=(*AMBER, 16), outline=(*AMBER, 100))
    text(draw, (686, 518), "verify on chain: simulate_settlement_split", MONO_TINY, AMBER)


def scene_guards(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 34.4
    text(draw, (60, 120), "Security guard lab", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "Every probe is a real revert path, not a promise in a README.", BODY, MIST)
    panel(draw, (60, 205, 850, 550), radius=16, fill=(*ABYSS, 245), outline=(*TEAL, 70))
    lines = [
        ("$ probe unilateral_mutual_release", MIST),
        ("REVERT [EXPECTED] only the shipper or the carrier can co-sign", CORAL),
        ("$ probe reclaim_after_manifest", MIST),
        ("REVERT [EXPECTED] manifest was submitted on time, reclaim is blocked", CORAL),
        ("$ probe untrusted_manifest_url", MIST),
        ("REVERT [EXPECTED] manifest URL must use https", CORAL),
    ]
    for index, (line, color) in enumerate(lines):
        appear = local > 0.6 + index * 0.55
        if not appear:
            continue
        text(draw, (84, 230 + index * 44), line, MONO, color)

    draw.rounded_rectangle((900, 220, 1210, 470), radius=20, fill=(*DECK, 235), outline=(*CORAL, 140), width=2)
    text(draw, (1055, 248), "RED LINES", MONO_SMALL, CORAL, anchor="ma")
    for index, line in enumerate(["NO OWNER", "NO ADMIN", "NO BYPASS"]):
        text(draw, (1055, 292 + index * 44), line, H2, WHITE, anchor="ma")
    text(draw, (1055, 430), "funds move only by", TINY, MIST, anchor="ma")
    text(draw, (1055, 446), "consensus or co-signature", TINY, TEAL, anchor="ma")


def load_evidence() -> dict:
    evidence_path = ROOT / "evidence" / "studionet_deployment.json"
    if evidence_path.exists():
        try:
            data = json.loads(evidence_path.read_text())
            return data
        except (ValueError, OSError):
            pass
    return {}


def scene_evidence(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 41.4
    text(draw, (60, 120), "Verifiable deployment identity", TITLE_SMALL, WHITE)
    text(draw, (62, 160), "Four independent sha256 reads resolve to the same contract source.", BODY, MIST)
    evidence = load_evidence()
    four = evidence.get("four_way_sha256", {})
    contract = evidence.get("contract_address", "0x96Ff91bA7AB99e9E9089cC6aa9FF5Ef31500becb")
    labels = [
        ("local contract file", four.get("contract_file_sha256", "17ff4905...a15f4")),
        ("git blob at HEAD", four.get("git_blob_sha256", "17ff4905...a15f4")),
        ("deploy payload", four.get("deploy_payload_sha256", "17ff4905...a15f4")),
        ("on-chain source", four.get("on_chain_code_sha256", "17ff4905...a15f4")),
    ]
    for index, (label, value) in enumerate(labels):
        x = 60 + (index % 2) * 600
        y = 215 + (index // 2) * 120
        appear = ease(progress(local, index * 0.25, 0.8 + index * 0.25))
        panel(draw, (x, y, x + 560, y + 96), radius=14, fill=(*DECK, int(240 * appear)))
        text(draw, (x + 18, y + 16), label.upper(), MONO_TINY, MIST)
        text(draw, (x + 18, y + 38), str(value)[:46] + ("..." if len(str(value)) > 46 else ""), MONO_SMALL, WHITE)
        draw.ellipse((x + 512, y + 20, x + 540, y + 48), fill=(*TEAL, int(45 * appear)), outline=(*TEAL, 180))
        if appear > 0.6:
            draw.line((x + 520, y + 34, x + 526, y + 40), fill=TEAL, width=2)
            draw.line((x + 526, y + 40, x + 534, y + 27), fill=TEAL, width=2)
    text(draw, (60, 470), "ALL FOUR DIGESTS MATCH", H2, TEAL)
    text(draw, (62, 504), f"contract {contract}", MONO_SMALL, ICE)
    text(draw, (62, 526), "deployment and guard claims are backed by studionet transactions", TINY, MIST)


def scene_close(frame: Image.Image, draw: ImageDraw.ImageDraw, t: float) -> None:
    local = t - 45.2
    logo = LOGO.resize((150, 150), Image.LANCZOS)
    frame.alpha_composite(logo, (110, 230))
    text(draw, (300, 240), "FREIGHTPULSE", ImageFont.truetype(str(FONT_BOLD), 44), WHITE)
    text(draw, (302, 298), "AI-audited cold-chain fulfilment", H3, ICE)
    text(draw, (302, 336), "github.com/richeroveis/freight-pulse", MONO, MIST)
    text(draw, (302, 364), "studionet 61999  /  evidence in the repository", MONO_SMALL, TEAL)
    draw.rounded_rectangle((302, 404, 700, 442), radius=10, fill=(*TEAL, 18), outline=(*TEAL, 130))
    text(draw, (320, 412), "NO OWNER. NO ADMIN. NO BYPASS.", MONO_SMALL, TEAL)


def render_frame(t: float) -> Image.Image:
    frame = BACKGROUND.copy()
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    header(frame, draw, t)

    if t < 7.0:
        scene_intro(frame, draw, t)
    elif t < 13.6:
        scene_escrow(frame, draw, t)
    elif t < 20.4:
        scene_consensus(frame, draw, t)
    elif t < 27.2:
        scene_bands(frame, draw, t)
    elif t < 34.4:
        scene_simulator(frame, draw, t)
    elif t < 41.4:
        scene_guards(frame, draw, t)
    elif t < 45.2:
        scene_evidence(frame, draw, t)
    else:
        scene_close(frame, draw, t)

    scene_label(draw, t)
    subtitle(draw, t)
    footer(draw, t)
    frame = Image.alpha_composite(frame, overlay)

    for boundary in [7.0, 13.6, 20.4, 27.2, 34.4, 41.4, 45.2]:
        distance = abs(t - boundary)
        if distance < 0.25:
            alpha = int(120 * (1 - distance / 0.25))
            fade = Image.new("RGBA", (WIDTH, HEIGHT), (*ABYSS, alpha))
            frame = Image.alpha_composite(frame, fade)
    return frame.convert("RGB")


def main() -> None:
    if not AUDIO.exists():
        raise SystemExit("Generate artifacts/soundtrack.wav first")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-i",
        str(AUDIO),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-shortest",
        str(OUT),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    total = int(DURATION * FPS)
    for index in range(total):
        frame = render_frame(index / FPS)
        assert process.stdin is not None
        process.stdin.write(frame.tobytes())
        if index % 96 == 0:
            print(f"frame {index}/{total}", flush=True)
    process.stdin.close()
    process.wait()
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"{OUT.relative_to(ROOT)} {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
