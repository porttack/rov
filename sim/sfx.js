// sfx.js — small synthesized sound effects (Web Audio, no files). Used by eel.js: a crackling buzz while the eel zaps.
// Only plays while the music button (title bar) is on.
import { musicState } from "./music.js";
let ctx = null, noise = null, zapNodes = null;
const enabled = () => musicState().on;                 // one switch for all sound: the music button in the title bar

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
const noiseSrc = (c) => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; return s; };

/** Call every frame with whether the eel is zapping: the buzz and crackle run while true. */
export function zap(on) {
  if (on && !enabled()) on = false;
  if (!on) {
    if (zapNodes) { const c = ctx, n = zapNodes; zapNodes = null; n.out.gain.setTargetAtTime(0, c.currentTime, 0.04); setTimeout(() => { n.stop.forEach((s) => { try { s.stop(); } catch (e) { /* ended */ } }); }, 300); }
    return;
  }
  const c = audio(); if (!c) return;
  if (!zapNodes) {
    const out = c.createGain(); out.gain.value = 0; out.connect(c.destination); out.gain.setTargetAtTime(0.5, c.currentTime, 0.02);
    const buzz = c.createOscillator(); buzz.type = "sawtooth"; buzz.frequency.value = 100;               // a rough mains-like hum
    const bg = c.createGain(); bg.gain.value = 0.12; buzz.connect(bg).connect(out);
    const n = noiseSrc(c), hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
    const crackle = c.createGain(); crackle.gain.value = 0; n.connect(hp).connect(crackle).connect(out);
    buzz.start(); n.start();
    zapNodes = { out, crackle, buzz, stop: [buzz, n] };
  }
  const t = ctx.currentTime;
  zapNodes.crackle.gain.setValueAtTime(Math.random() < 0.55 ? 0.15 + Math.random() * 0.7 : 0.02, t);     // random snaps, once a frame
  zapNodes.buzz.frequency.setValueAtTime(70 + Math.random() * 90, t);
}
