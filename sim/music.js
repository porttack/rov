// music.js — optional background music. Off by default; the Config dialog's "Music" row turns it on.
// The track is web/music/background.mp3 (or .ogg/.m4a/.wav as the first one found) which you add yourself,
// or a file picked in the dialog (kept only for this page load). Volume starts at half. The on/off and the volume are remembered in this browser.
// Browsers only start sound after a click or key press, so a remembered "on" starts at your first click or key.
const KEY = "rovsim.music";
const NAMES = ["background.mp3", "background.ogg", "background.m4a", "background.wav"];
let audio = null, picked = null, found, state = { on: false, volume: 0.5 };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* no storage: fine */ }
state.volume = Math.max(0, Math.min(1, Number(state.volume) || 0));
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

/** The URL of the track to play: a picked file, else the first background.* in music/ (cached), else null. */
async function source() {
  if (picked) return picked;
  if (found !== undefined) return found;
  found = null;
  for (const n of NAMES) {
    try { const r = await fetch(`music/${n}`, { method: "HEAD" }); if (r.ok && !/text\/html/.test(r.headers.get("content-type") || "")) { found = `music/${n}`; break; } }
    catch (e) { /* try the next */ }
  }
  return found;
}
export const musicState = () => ({ ...state });
export const musicAvailable = async () => !!(await source());

/** Start or stop. Resolves true if it is playing (false: no track, or the browser wants a click first). */
export async function setMusicOn(on) {
  state.on = !!on; save();
  if (!on) { if (audio) audio.pause(); return false; }
  const src = await source();
  if (!src) return false;
  if (!audio) { audio = new Audio(); audio.loop = true; }
  if (audio.getAttribute("src") !== src) audio.src = src;
  audio.volume = state.volume;
  try { await audio.play(); return true; } catch (e) { return false; }
}
export function setMusicVolume(v) { state.volume = Math.max(0, Math.min(1, Number(v) || 0)); save(); if (audio) audio.volume = state.volume; }
/** Use a File the person picked (this page load only). */
export function useMusicFile(file) {
  if (picked) URL.revokeObjectURL(picked);
  picked = URL.createObjectURL(file);
  return state.on ? setMusicOn(true) : Promise.resolve(false);
}
/** Call once at start-up: if music was left on, begin at the first click or key. */
export function initMusic() {
  const btn = document.getElementById("music"), show = () => { if (btn) { btn.classList.toggle("on", state.on); btn.setAttribute("aria-pressed", String(state.on)); } };
  if (btn) btn.addEventListener("click", async () => {
    const playing = !!audio && !audio.paused;
    await setMusicOn(state.on && !playing ? true : !state.on);       // remembered "on" but not playing yet (the browser wanted a click): this click starts it
    if (state.on && !(await musicAvailable())) { state.on = false; save(); btn.title = "No music file yet: put web/music/background.mp3 there, or choose a file in Config"; }
    show();
  });
  show();
  if (!state.on) return;
  const go = (e) => {
    if (e.target && e.target.id === "music") return;                  // the button's own click handles that
    removeEventListener("pointerdown", go); removeEventListener("keydown", go); if (state.on) setMusicOn(true); };
  addEventListener("pointerdown", go); addEventListener("keydown", go);
}
