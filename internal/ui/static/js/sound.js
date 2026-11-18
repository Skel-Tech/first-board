let ctx = null;
let muted = localStorage.getItem("firstboard.mute") === "1";

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem("firstboard.mute", muted ? "1" : "0");
  return muted;
}

export function unlock() {
  if (muted) return;
  try {
    audio();
  } catch {
    /* the browser can stay silent */
  }
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function tone(kind) {
  if (muted) return;
  let c;
  try {
    c = audio();
  } catch {
    return;
  }
  const table = {
    move: [520, 0.07],
    capture: [190, 0.09],
    check: [660, 0.1],
    win: [523, 0.16],
    bad: [140, 0.08],
  };
  const pair = table[kind] || table.move;
  blip(c, pair[0], pair[1], kind === "capture" ? "triangle" : "sine", 0);
  if (kind === "check" || kind === "win") blip(c, pair[0] * 1.5, 0.14, "sine", 0.09);
}

function blip(c, freq, dur, type, delay) {
  const now = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}
