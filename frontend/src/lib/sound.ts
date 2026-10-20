type SoundName =
  | "click"
  | "wallet"
  | "full"
  | "late"
  | "spoilage"
  | "revert"
  | "settle"
  | "drawer";

class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.28, this.context.currentTime, 0.05);
    }
  }

  isMuted() {
    return this.muted;
  }

  private ensure(): { context: AudioContext; master: GainNode } | null {
    if (typeof window === "undefined") return null;
    if (!this.context) {
      const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return null;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.28;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return { context: this.context, master: this.master as GainNode };
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    glideTo?: number,
  ) {
    const engine = this.ensure();
    if (!engine) return;
    const { context, master } = engine;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
    if (glideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(40, glideTo),
        context.currentTime + start + duration,
      );
    }
    envelope.gain.setValueAtTime(0.0001, context.currentTime + start);
    envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(context.currentTime + start);
    oscillator.stop(context.currentTime + start + duration + 0.05);
  }

  private noise(start: number, duration: number, gain: number) {
    const engine = this.ensure();
    if (!engine) return;
    const { context, master } = engine;
    const frames = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 780;
    const envelope = context.createGain();
    envelope.gain.value = gain;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(context.currentTime + start);
  }

  play(name: SoundName) {
    if (this.muted) return;
    switch (name) {
      case "click":
        this.tone(880, 0, 0.06, "triangle", 0.12);
        break;
      case "wallet":
        this.tone(520, 0, 0.12, "sine", 0.18);
        this.tone(780, 0.08, 0.16, "sine", 0.16);
        this.tone(1040, 0.16, 0.22, "sine", 0.12);
        break;
      case "full":
        this.tone(523.25, 0, 0.18, "sine", 0.2);
        this.tone(659.25, 0.1, 0.2, "sine", 0.2);
        this.tone(783.99, 0.2, 0.24, "sine", 0.2);
        this.tone(1046.5, 0.32, 0.4, "triangle", 0.16);
        break;
      case "late":
        this.tone(392, 0, 0.22, "triangle", 0.2);
        this.tone(329.63, 0.16, 0.36, "triangle", 0.18);
        break;
      case "spoilage":
        this.tone(220, 0, 0.4, "sawtooth", 0.14, 110);
        this.noise(0.05, 0.3, 0.05);
        break;
      case "revert":
        this.tone(196, 0, 0.16, "square", 0.1);
        this.tone(185, 0.12, 0.18, "square", 0.1);
        this.noise(0, 0.12, 0.04);
        break;
      case "settle":
        this.tone(440, 0, 0.1, "sine", 0.16);
        this.tone(554.37, 0.07, 0.14, "sine", 0.16);
        this.tone(659.25, 0.14, 0.26, "sine", 0.14);
        break;
      case "drawer":
        this.tone(1200, 0, 0.05, "sine", 0.06);
        break;
      default:
        break;
    }
  }
}

export const sound = new SoundEngine();
