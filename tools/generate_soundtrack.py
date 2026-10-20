#!/usr/bin/env python3
"""Synthesize a 48 second ambient electronic soundtrack for the FreightPulse demo."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "soundtrack.wav"
SR = 44_100
DURATION = 48.0
BPM = 92.0
BEAT = 60.0 / BPM


def note(name: str) -> float:
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    if name == "R":
        return 0.0
    pitch = name[:-1]
    octave = int(name[-1])
    midi = 12 * (octave + 1) + names[pitch]
    return 440.0 * (2 ** ((midi - 69) / 12))


def adsr(length: int, attack: float, decay: float, sustain: float, release: float) -> np.ndarray:
    attack_n = max(1, int(attack * SR))
    decay_n = max(1, int(decay * SR))
    release_n = max(1, int(release * SR))
    sustain_n = max(0, length - attack_n - decay_n - release_n)
    env = np.concatenate(
        [
            np.linspace(0.0, 1.0, attack_n, dtype=np.float32),
            np.linspace(1.0, sustain, decay_n, dtype=np.float32),
            np.full(sustain_n, sustain, dtype=np.float32),
            np.linspace(sustain, 0.0, release_n, dtype=np.float32),
        ]
    )
    if len(env) < length:
        env = np.pad(env, (0, length - len(env)))
    return env[:length]


def lowpass(signal: np.ndarray, cutoff: float) -> np.ndarray:
    alpha = np.clip(2 * np.pi * cutoff / SR, 0.0, 1.0)
    out = np.empty_like(signal)
    state = 0.0
    for index, sample in enumerate(signal):
        state += alpha * (sample - state)
        out[index] = state
    return out


def saw(frequency: float, length: int, detune: float = 0.0) -> np.ndarray:
    t = np.arange(length, dtype=np.float32) / SR
    phase = (t * frequency * (1.0 + detune)) % 1.0
    return (2.0 * phase - 1.0).astype(np.float32)


def sine(frequency: float, length: int, phase_offset: float = 0.0) -> np.ndarray:
    t = np.arange(length, dtype=np.float32) / SR
    return np.sin(2 * np.pi * frequency * t + phase_offset).astype(np.float32)


def add(buffer: np.ndarray, signal: np.ndarray, start: float, gain: float, pan: float = 0.0) -> None:
    start_index = int(start * SR)
    end_index = min(len(buffer), start_index + len(signal))
    if start_index >= len(buffer):
        return
    segment = signal[: end_index - start_index] * gain
    left = np.sqrt(0.5 * (1.0 - pan))
    right = np.sqrt(0.5 * (1.0 + pan))
    buffer[start_index:end_index, 0] += segment * left
    buffer[start_index:end_index, 1] += segment * right


def build() -> np.ndarray:
    length = int(DURATION * SR)
    mix = np.zeros((length, 2), dtype=np.float32)
    rng = np.random.default_rng(7)

    chords = [
        ["A2", "A3", "C4", "E4", "B4"],
        ["F2", "F3", "A3", "C4", "E4"],
        ["C3", "C4", "E4", "G4", "D5"],
        ["G2", "G3", "B3", "D4", "E4"],
    ]
    bass_notes = ["A1", "F1", "C2", "G1"]
    arp_pattern = [0, 2, 4, 2, 1, 3, 2, 4]

    bar = 4 * BEAT
    for bar_index in range(12):
        chord = chords[bar_index % len(chords)]
        start = bar_index * bar
        for voice_index, name in enumerate(chord):
            frequency = note(name)
            pad_length = int(bar * SR)
            pad = (
                sine(frequency, pad_length)
                + 0.45 * saw(frequency, pad_length, 0.003)
                + 0.35 * saw(frequency, pad_length, -0.004)
            ) / 1.8
            pad = lowpass(pad, 900 + 120 * voice_index)
            envelope = adsr(pad_length, 1.2, 0.9, 0.55, 1.4)
            add(mix, pad * envelope, start, 0.055, pan=(voice_index - 2) * 0.22)

        bass_frequency = note(bass_notes[bar_index % len(bass_notes)])
        for beat_index in range(4):
            bass_length = int(BEAT * 0.9 * SR)
            bass = sine(bass_frequency, bass_length) + 0.25 * sine(bass_frequency * 2, bass_length)
            envelope = adsr(bass_length, 0.01, 0.12, 0.6, 0.25)
            add(mix, bass * envelope, start + beat_index * BEAT, 0.16)

        for step in range(8):
            name = chord[arp_pattern[step] % len(chord)]
            frequency = note(name) * 2
            pluck_length = int(BEAT * 0.45 * SR)
            pluck = sine(frequency, pluck_length) + 0.3 * sine(frequency * 2.01, pluck_length)
            envelope = np.exp(-np.arange(pluck_length) / (SR * 0.16)).astype(np.float32)
            add(
                mix,
                pluck * envelope,
                start + step * BEAT * 0.5,
                0.045,
                pan=0.35 if step % 2 == 0 else -0.35,
            )

        for beat_index in range(4):
            kick_length = int(0.22 * SR)
            t = np.arange(kick_length) / SR
            kick = np.sin(2 * np.pi * (86 * np.exp(-t * 18) + 42) * t).astype(np.float32)
            kick *= np.exp(-t * 16)
            add(mix, kick, start + beat_index * BEAT, 0.16)

        for eighth in range(8):
            if eighth % 2 == 1:
                hat_length = int(0.05 * SR)
                hat = rng.normal(0, 1, hat_length).astype(np.float32)
                hat = np.diff(np.concatenate([[0.0], hat])).astype(np.float32)
                hat *= np.exp(-np.arange(hat_length) / (SR * 0.012))
                add(mix, hat, start + eighth * BEAT * 0.5, 0.035, pan=0.2)

    # gentle riser into the final scene
    riser_length = int(4.0 * SR)
    riser = rng.normal(0, 1, riser_length).astype(np.float32)
    riser = lowpass(riser, 1400)
    riser *= np.linspace(0.0, 1.0, riser_length, dtype=np.float32) ** 2
    add(mix, riser, DURATION - 7.0, 0.05)

    # stereo delay on a copy of the arp bus
    delay = int(BEAT * 0.75 * SR)
    delayed = np.zeros_like(mix)
    delayed[delay:] = mix[:-delay] * 0.18
    mix = mix + delayed

    # soft clip and normalize
    mix = np.tanh(mix * 1.4)
    peak = float(np.max(np.abs(mix))) or 1.0
    mix = mix / peak * 0.88
    fade = int(1.2 * SR)
    mix[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)[:, None]
    mix[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)[:, None]
    return mix


def main() -> None:
    mix = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(mix, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(OUT), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())
    print(f"{OUT.relative_to(ROOT)} {OUT.stat().st_size} bytes {DURATION:.0f}s")


if __name__ == "__main__":
    main()
