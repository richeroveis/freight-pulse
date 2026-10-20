#!/usr/bin/env python3
"""Generate the FreightPulse 512x512 logo. Crisp, reproducible, no external assets."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
SCALE = 4
CANVAS = SIZE * SCALE

ABYSS = (6, 13, 26, 255)
HULL = (10, 20, 36, 255)
RAIL = (27, 44, 68, 255)
ICE = (127, 227, 240)
TEAL = (45, 212, 191)
CORAL = (251, 113, 133)


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    y = np.linspace(0.0, 1.0, size, dtype=np.float32).reshape(-1, 1)
    top_arr = np.array(top, dtype=np.float32)
    bottom_arr = np.array(bottom, dtype=np.float32)
    rows = top_arr[None, :] * (1.0 - y) + bottom_arr[None, :] * y
    grid = np.repeat(rows[:, None, :], size, axis=1)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[:, :, :3] = grid.astype(np.uint8)
    rgba[:, :, 3] = 255
    return Image.fromarray(rgba, mode="RGBA")


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def f_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    unit = size / 512.0
    stem_x0, stem_x1 = int(176 * unit), int(262 * unit)
    top_y0, top_y1 = int(140 * unit), int(226 * unit)
    mid_y0, mid_y1 = int(238 * unit), int(318 * unit)
    draw.rounded_rectangle((stem_x0, top_y0, stem_x1, int(408 * unit)), radius=int(30 * unit), fill=255)
    draw.rounded_rectangle((stem_x0, top_y0, int(360 * unit), top_y1), radius=int(30 * unit), fill=255)
    draw.rounded_rectangle((stem_x0, mid_y0, int(318 * unit), mid_y1), radius=int(26 * unit), fill=255)
    return mask


def draw_snowflake(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float, width: int, color) -> None:
    for index in range(6):
        angle = np.deg2rad(index * 60)
        dx = np.cos(angle) * radius
        dy = np.sin(angle) * radius
        draw.line((cx - dx, cy - dy, cx + dx, cy + dy), fill=color, width=width)
        for branch in (0.55, 0.78):
            bx = cx + dx * branch
            by = cy + dy * branch
            for side in (-1, 1):
                branch_angle = angle + side * np.deg2rad(38)
                draw.line(
                    (
                        bx,
                        by,
                        bx + np.cos(branch_angle) * radius * 0.28,
                        by + np.sin(branch_angle) * radius * 0.28,
                    ),
                    fill=color,
                    width=max(2, width - 2),
                )
    draw.ellipse((cx - width, cy - width, cx + width, cy + width), fill=color)


def build() -> Image.Image:
    canvas = gradient(CANVAS, (8, 18, 33), (4, 9, 18))
    mask = rounded_mask(CANVAS, int(96 * SCALE))
    canvas.putalpha(mask)

    # inner grid
    grid = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid)
    step = int(32 * SCALE)
    for x in range(step, CANVAS, step):
        grid_draw.line((x, 0, x, CANVAS), fill=(27, 44, 68, 70), width=max(1, SCALE // 2))
    for y in range(step, CANVAS, step):
        grid_draw.line((0, y, CANVAS, y), fill=(27, 44, 68, 70), width=max(1, SCALE // 2))
    canvas = Image.alpha_composite(canvas, grid)

    # hexagon frame
    frame = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    frame_draw = ImageDraw.Draw(frame)
    cx = cy = CANVAS / 2
    radius = 196 * SCALE
    points = [
        (cx + radius * np.cos(np.deg2rad(60 * index - 90)), cy + radius * np.sin(np.deg2rad(60 * index - 90)))
        for index in range(6)
    ]
    frame_draw.line(points + [points[0]], fill=RAIL, width=int(3.2 * SCALE), joint="curve")
    inner = [
        (cx + (radius - 18 * SCALE) * np.cos(np.deg2rad(60 * index - 90)), cy + (radius - 18 * SCALE) * np.sin(np.deg2rad(60 * index - 90)))
        for index in range(6)
    ]
    frame_draw.line(inner + [inner[0]], fill=(*TEAL, 90), width=int(1.2 * SCALE), joint="curve")
    canvas = Image.alpha_composite(canvas, frame)

    # F monogram with ice-to-teal gradient
    f_image = gradient(CANVAS, ICE, TEAL)
    f_image.putalpha(f_mask(CANVAS))
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.bitmap((0, 0), f_mask(CANVAS), fill=(*ICE, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * SCALE))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas = Image.alpha_composite(canvas, f_image)

    # pulse line with glow
    pulse = [
        (72, 330),
        (146, 330),
        (178, 286),
        (214, 372),
        (244, 306),
        (300, 306),
        (332, 262),
        (368, 344),
        (404, 306),
        (440, 306),
    ]
    pulse_points = [(x * SCALE, y * SCALE) for x, y in pulse]
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.line(pulse_points, fill=(*CORAL, 210), width=int(10 * SCALE), joint="curve")
    glow = glow.filter(ImageFilter.GaussianBlur(10 * SCALE))
    canvas = Image.alpha_composite(canvas, glow)
    pulse_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pulse_draw = ImageDraw.Draw(pulse_layer)
    pulse_draw.line(pulse_points, fill=(*CORAL, 255), width=int(4.2 * SCALE), joint="curve")
    for point in (pulse_points[0], pulse_points[-1]):
        pulse_draw.ellipse(
            (point[0] - 5 * SCALE, point[1] - 5 * SCALE, point[0] + 5 * SCALE, point[1] + 5 * SCALE),
            fill=(255, 255, 255, 255),
        )
    canvas = Image.alpha_composite(canvas, pulse_layer)

    # snowflake badge
    badge = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge)
    badge_draw.ellipse(
        (332 * SCALE, 118 * SCALE, 418 * SCALE, 204 * SCALE),
        fill=HULL,
        outline=(*TEAL, 180),
        width=int(1.6 * SCALE),
    )
    draw_snowflake(badge_draw, 375 * SCALE, 161 * SCALE, 26 * SCALE, int(2.4 * SCALE), (*ICE, 255))
    canvas = Image.alpha_composite(canvas, badge)

    # temperature dots
    dots = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    dots_draw = ImageDraw.Draw(dots)
    for index, color in enumerate((TEAL, ICE, CORAL)):
        x = (196 + index * 60) * SCALE
        y = 430 * SCALE
        dots_draw.ellipse((x - 5 * SCALE, y - 5 * SCALE, x + 5 * SCALE, y + 5 * SCALE), fill=(*color, 255))
    canvas = Image.alpha_composite(canvas, dots)

    # outer rim
    rim = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle(
        (0, 0, CANVAS - 1, CANVAS - 1),
        radius=int(96 * SCALE),
        outline=(*ICE, 46),
        width=int(1.4 * SCALE),
    )
    canvas = Image.alpha_composite(canvas, rim)

    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    image = build()
    for target in (ROOT / "frontend" / "public" / "logo.png", ROOT / "docs" / "logo.png"):
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, format="PNG", optimize=True)
        print(f"{target.relative_to(ROOT)} {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
