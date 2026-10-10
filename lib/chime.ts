// Token-board chime on holder change: two sine tones, 659 Hz then 523 Hz, 300 ms each, gain 0.3.
let ctx: AudioContext | null = null;

export function chime() {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    [659, 523].forEach((hz, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.3, t0 + i * 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.3 + 0.29);
      o.connect(g).connect(ctx!.destination);
      o.start(t0 + i * 0.3);
      o.stop(t0 + i * 0.3 + 0.3);
    });
  } catch {
    /* no audio: the board still works */
  }
}
