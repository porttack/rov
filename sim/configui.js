// configui.js — the Config dialog (the toolbar's Config button, or ?config in the address): set the page's options, see and copy the link.
// The options and their rules are in config.js.
//   RIGHT NOW   the tool, the water (on/off and how it is drawn), the pool size and the thruster power change the pool as soon as you change them
//               (app.js gives this file a `live` object that does the work).
//   RESTART     the controls mode, the fish, rings, crabs and the camera are built when the page starts: they apply when you press Restart,
//               which reloads the page with the new address.
import { DEFAULTS, LIMITS, CONFIG_KEYS, FLOW_LOOKS, THRUSTER_MODES, POOL_DEPTHS, POOL_PRESETS, toQuery, poolSizeText } from "./config.js";

const CSS = `
#configui { position: fixed; inset: 0; z-index: 50; background: rgba(4, 16, 26, .3); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
#configui .box { background: #0f2a3d; color: #fff; border-radius: 12px; padding: 16px 20px; width: min(800px, 100%); max-height: 100%; overflow-y: auto; box-shadow: 0 10px 40px #000a; font: 14px/1.4 -apple-system, system-ui, sans-serif; }
#configui h2 { margin: 0 0 2px; font-size: 18px; } #configui .sub { opacity: .75; margin: 0 0 10px; }
#configui .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; align-items: start; }
@media (max-width: 760px) { #configui .cols { grid-template-columns: 1fr; } }
#configui fieldset { border: 1px solid rgba(255,255,255,.25); border-radius: 8px; margin: 0 0 10px; padding: 6px 10px 8px; min-width: 0; }
#configui fieldset.now { border-color: #f2b705aa; }
#configui legend { padding: 0 6px; font-weight: 600; }
#configui legend small { font-weight: 400; opacity: .75; }
#configui label { display: flex; gap: 8px; align-items: baseline; margin: 3px 0; cursor: pointer; }
#configui label small { opacity: .7; }
#configui .row > label small { display: block; }
#configui .row { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin: 5px 0; }
#configui .tools { display: flex; gap: 16px; }
#configui fieldset.now .row { flex-direction: column; align-items: stretch; gap: 3px; margin: 8px 0; }     /* the label above its control: these columns are narrow */
#configui fieldset.now .row > label small { display: inline; }
#configui fieldset.now .row.inline { flex-direction: row; align-items: center; justify-content: space-between; }
#configui fieldset.now select { width: 100%; }
#configui fieldset.now .speed { width: 100%; } #configui fieldset.now .speed input { flex: 1; width: auto; }
#configui select, #configui input[type=number] { background: #1b4260; color: #fff; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; padding: 3px 6px; font: inherit; max-width: 100%; }
#configui input[type=number] { width: 4.5em; }
#configui .note { font-size: 12px; opacity: .75; margin: 4px 0 0; }
#configui .off { opacity: .5; }
#configui .speed { display: flex; gap: 8px; align-items: center; white-space: nowrap; } #configui .speed input { width: 130px; } #configui .speed b { min-width: 2.6em; text-align: right; }
#configui .link { display: flex; gap: 6px; margin: 4px 0 12px; } #configui .link input { flex: 1; min-width: 0; background: #091c2a; color: #cfe8f7; border: 1px solid rgba(255,255,255,.3); border-radius: 6px; padding: 5px 8px; font: 12px ui-monospace, Menlo, monospace; }
#configui .buttons { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
#configui button { background: #1d6f9f; color: #fff; border: 0; border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
#configui button.go { background: #f2b705; color: #111; font-weight: 600; } #configui button.quiet { background: rgba(255,255,255,.15); }
#configui a { color: #8fd0f5; }
`;

/** `live` (from app.js) has { tool, current, flow, pool, speed, thrusters, buoyancy } each either null (this version cannot change it now) or { get(), set(...) }, and changed(cur). */
export function showConfig({ cfg, configurable = {}, live = {} }) {
  if (document.getElementById("configui")) return;
  const cur = {}; for (const k of CONFIG_KEYS) cur[k] = cfg[k];
  if (live.current) cur.current = live.current.get();
  if (live.flow) cur.flow = live.flow.get();
  if (live.speed) cur.speed = live.speed.get();
  if (live.thrusters) cur.thrusters = live.thrusters.get();
  if (live.pool) [cur.poollength, cur.poolwidth, cur.pooldepth] = live.pool.get();
  let tool = live.tool ? live.tool.get() : "nose";
  const buoy = live.buoyancy ? live.buoyancy.get() : "neutral";
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement("div"); el.id = "configui"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Configure the pool");
  const can = (k) => configurable[k] !== false;                                   // the restart options: only the Python server cannot do some of them
  const opt = (v, text, sel) => `<option value="${v}"${sel ? " selected" : ""}>${text}</option>`;
  const radio = (v, text, sub) => `<label><input type="radio" name="cfg-controls" value="${v}"${cur.controls === v ? " checked" : ""}><span>${text}<br><small>${sub}</small></span></label>`;
  const sizeKey = (L, W) => `${L}x${W}`;
  const presets = POOL_PRESETS.map(([L, W, name]) => opt(sizeKey(L, W), `${name}: ${poolSizeText(L, W)}`, cur.poollength === L && cur.poolwidth === W));
  if (!POOL_PRESETS.some(([L, W]) => L === cur.poollength && W === cur.poolwidth)) presets.push(opt(sizeKey(cur.poollength, cur.poolwidth), `Custom: ${poolSizeText(cur.poollength, cur.poolwidth)}`, true));
  const dis = (x) => (x ? "" : " disabled"), off = (x) => (x ? "" : "off");
  el.innerHTML = `<div class="box">
    <h2>Configure the pool</h2>
    <p class="sub">The first box changes the pool <b>right away</b>. The second needs a <b>restart</b>: pick what you want, then press Restart. The link makes the same setup for anyone you send it to.</p>
    <div class="cols">
    <fieldset class="now"><legend>Right now <small>(changes as you click)</small></legend>
      <div class="row inline ${off(live.tool)}"><span>Front tool</span><span class="tools">
        <label><input type="radio" name="cfg-tool" value="nose"${tool === "nose" ? " checked" : ""}${dis(live.tool)}> Nose</label>
        <label><input type="radio" name="cfg-tool" value="claw"${tool === "claw" ? " checked" : ""}${dis(live.tool)}> Claw</label></span></div>
      <div class="row ${off(live.buoyancy)}"><label for="cfg-buoy">Buoyancy <small>(B does this too)</small></label><select id="cfg-buoy"${dis(live.buoyancy)}>${[["positive", "floats (a little positive)"], ["neutral", "neutral (hovers)"], ["negative", "sinks"]].map(([v, t]) => opt(v, t, buoy === v)).join("")}</select></div>
      <div class="row ${off(live.pool)}"><label for="cfg-pool">Main pool size</label><select id="cfg-pool"${dis(live.pool)}>${presets.join("")}</select></div>
      <div class="row ${off(live.pool)}"><label for="cfg-depth">Main pool depth</label><select id="cfg-depth"${dis(live.pool)}>${POOL_DEPTHS.map((d) => opt(d, `${d} m${d === 2 ? " (normal)" : ""}`, cur.pooldepth === d)).join("")}</select></div>
      <div class="row ${off(live.current)}"><label><input type="checkbox" id="cfg-current"${cur.current ? " checked" : ""}${dis(live.current)}><span>Run the water<br><small>from the two outlets in the side wall, as if filling the pool: it pushes and tilts the ROV (the outlets are always there)</small></span></label></div>
      <div class="row ${off(live.flow)}"><label for="cfg-flow">How the water is drawn <small>(J does this too)</small></label><select id="cfg-flow"${dis(live.flow)}>${FLOW_LOOKS.map((v) => `<option value="${v}"${cur.flow === v ? " selected" : ""}>${{ bubbles: "bubbles", streaks: "streaks (tracer lines)", rings: "ripple rings", mix: "rings and bubbles" }[v]}</option>`).join("")}</select></div>
      <div class="row ${off(live.speed)}"><label for="cfg-speed">Red and green thruster power <small>(1&times; = normal)</small></label>
        <span class="speed"><input type="range" id="cfg-speed" min="${LIMITS.speed[0]}" max="${LIMITS.speed[1]}" step="0.25" value="${cur.speed}"${dis(live.speed)}> <b id="cfg-speedv"></b></span></div>
      <div class="row ${off(live.thrusters)}"><label for="cfg-thrusters">Thrusters <small>(the ROV starts over)</small></label><select id="cfg-thrusters"${dis(live.thrusters)}>${THRUSTER_MODES.map((n) => `<option value="${n}"${cur.thrusters === n ? " selected" : ""}>${{ 3: "3: red, green, one up/down", 4: "4: red, green, front and rear up/down", 6: "6: four on the posts, two up/down", 8: "8: one at each of the 8 corners" }[n]}</option>`).join("")}</select></div>
      <div class="note" id="cfg-size"></div>
      ${live.pool && live.current ? "" : '<div class="note">With the Python server the pool size, the water and the thruster power are set when it starts (--current, --speed, its pool).</div>'}
    </fieldset>
    <fieldset><legend>Needs a restart</legend>
      ${radio("all", "All keys", "the three switches and the extra keys. H switches modes.")}
      ${radio("h", "H-circuit only", "just the three switches, like the real controller. Locked: H does nothing.")}
      ${radio("h-hidden", "H-circuit only, everything else hidden", "only the switch box (and the camera view) on the page.")}
      <div class="row ${off(can("fish"))}"><label><input type="checkbox" id="cfg-fish"${cur.fish ? " checked" : ""}${dis(can("fish"))}> Fish</label></div>
      <div class="row ${off(can("rings"))}"><label for="cfg-rings">Pool rings (0&ndash;${LIMITS.rings[1]}, usually ${DEFAULTS.rings})</label><input type="number" id="cfg-rings" min="${LIMITS.rings[0]}" max="${LIMITS.rings[1]}" step="1" value="${cur.rings}"${dis(can("rings"))}></div>
      <div class="row ${off(can("crabs"))}"><label for="cfg-crabs">Green crabs (0&ndash;${LIMITS.crabs[1]}, usually ${DEFAULTS.crabs})</label><input type="number" id="cfg-crabs" min="${LIMITS.crabs[0]}" max="${LIMITS.crabs[1]}" step="1" value="${cur.crabs}"${dis(can("crabs"))}></div>
      <div class="row"><label><input type="checkbox" id="cfg-camera"${cur.camera ? " checked" : ""}> Camera <small>its housing on the ROV, the camera window, and the fish coming to look at it</small></label></div>
      ${can("fish") ? "" : '<div class="note">Fish, crabs and rings are set by the Python server (--fish, --crabs, --rings).</div>'}
    </fieldset>
    </div>
    <div class="link"><input id="cfg-link" readonly aria-label="Link for this setup"><button class="quiet" id="cfg-copy">Copy link</button></div>
    <div class="buttons"><button class="quiet" id="cfg-defaults">Defaults</button><button class="quiet" id="cfg-close">Close</button><button class="go" id="cfg-go">Restart with these</button></div>
    <p class="note">Everything here is also a plain address option (see <a href="help.html#options" target="_blank" rel="noopener">Help</a>).</p>
  </div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector("#" + id);

  const url = () => { const u = new URL(location.href); u.search = toQuery(cur, location.search); u.hash = ""; return u; };
  const refresh = () => {
    $("cfg-size").textContent = `Main pool: ${poolSizeText(cur.poollength, cur.poolwidth)}, ${cur.pooldepth} m deep, plus the shallow end.`;
    $("cfg-link").value = url().href;
    $("cfg-speedv").textContent = `${Number(cur.speed.toFixed(2))}×`;
  };
  const clampInt = (v, [lo, hi], dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
  /** Read the form into `cur`, and do what a changed "right now" field means. `which` is the id of the field that changed (or null for all). */
  const read = (which = null) => {
    cur.controls = el.querySelector('input[name="cfg-controls"]:checked').value;
    cur.fish = $("cfg-fish").checked;
    cur.rings = clampInt($("cfg-rings").value, LIMITS.rings, DEFAULTS.rings);
    cur.crabs = clampInt($("cfg-crabs").value, LIMITS.crabs, DEFAULTS.crabs);
    cur.camera = $("cfg-camera").checked;
    const was = { ...cur };
    cur.current = $("cfg-current").checked;
    cur.flow = $("cfg-flow").value;
    cur.speed = Math.max(LIMITS.speed[0], Math.min(LIMITS.speed[1], Number($("cfg-speed").value) || DEFAULTS.speed));
    cur.thrusters = Number($("cfg-thrusters").value) || DEFAULTS.thrusters;
    const [L, W] = $("cfg-pool").value.split("x").map(Number);
    cur.poollength = L; cur.poolwidth = W; cur.pooldepth = Number($("cfg-depth").value) || DEFAULTS.pooldepth;
    if (which === "cfg-current" && live.current) live.current.set(cur.current);
    if (which === "cfg-flow" && live.flow) live.flow.set(cur.flow);
    if (which === "cfg-buoy" && live.buoyancy) live.buoyancy.set($("cfg-buoy").value);
    if (which === "cfg-speed" && live.speed) live.speed.set(cur.speed);
    if (which === "cfg-thrusters" && live.thrusters && cur.thrusters !== was.thrusters) live.thrusters.set(cur.thrusters);
    if ((which === "cfg-pool" || which === "cfg-depth") && live.pool && (L !== was.poollength || W !== was.poolwidth || cur.pooldepth !== was.pooldepth)) live.pool.set(L, W, cur.pooldepth);
    if (which && which.startsWith("cfg-tool") && live.tool) { tool = el.querySelector('input[name="cfg-tool"]:checked').value; live.tool.set(tool); }
    if (which && live.changed) live.changed(cur);
    refresh();
  };
  el.addEventListener("input", (e) => { if (e.target.id === "cfg-speed") read("cfg-speed"); else if (e.target.type !== "radio" && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") read(null); });
  el.addEventListener("change", (e) => read(e.target.name === "cfg-tool" ? "cfg-tool" : e.target.id));
  $("cfg-defaults").addEventListener("click", () => {                          // back to the normal setup: the "right now" ones are applied at once
    Object.assign(cur, DEFAULTS);
    el.querySelectorAll('input[name="cfg-controls"]').forEach((r) => { r.checked = r.value === cur.controls; });
    $("cfg-fish").checked = cur.fish; $("cfg-rings").value = cur.rings; $("cfg-crabs").value = cur.crabs; $("cfg-camera").checked = cur.camera;
    $("cfg-current").checked = cur.current; $("cfg-flow").value = cur.flow; $("cfg-speed").value = cur.speed; $("cfg-thrusters").value = cur.thrusters; $("cfg-pool").value = `${cur.poollength}x${cur.poolwidth}`; $("cfg-depth").value = cur.pooldepth; $("cfg-buoy").value = "neutral";
    for (const id of ["cfg-current", "cfg-flow", "cfg-speed", "cfg-thrusters", "cfg-pool", "cfg-depth", "cfg-buoy"]) read(id);
  });
  $("cfg-go").addEventListener("click", () => { location.href = url().href; });
  const close = () => {
    el.remove(); style.remove();
    const u = new URL(location.href); u.searchParams.delete("config");
    try { history.replaceState(null, "", u.href); } catch (e) { /* ignore */ }
  };
  $("cfg-close").addEventListener("click", close);
  el.addEventListener("pointerdown", (e) => { if (e.target === el) close(); });
  $("cfg-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("cfg-link").value); $("cfg-copy").textContent = "Copied"; }
    catch (e) { $("cfg-link").select(); $("cfg-copy").textContent = "Press Ctrl+C"; }
    setTimeout(() => { $("cfg-copy").textContent = "Copy link"; }, 1500);
  });
  window.addEventListener("keydown", (e) => { if (e.code === "Escape" && document.getElementById("configui")) close(); });
  refresh();
  $("cfg-close").focus();
}
