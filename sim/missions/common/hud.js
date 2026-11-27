// hud.js — the page's panels for a mission: the countdown clock, the score board, and the crew's inventory screen. Plain DOM (no three.js), made only when a mission is on.
// setup({ backend, toast }) returns { update(state), get modal() }: the page calls update() with every state; while `modal` is true the page ignores the keyboard.
const CSS = `
#mission { position: fixed; right: 8px; top: 262px; width: 252px; z-index: 6; background: rgba(8,30,50,.82); color: #fff; border-radius: 10px; padding: 8px 10px;
  font: 12px/1.35 -apple-system, system-ui, sans-serif; max-height: calc(100vh - 280px); overflow: auto; }
#mission .top { display: flex; justify-content: space-between; align-items: baseline; }
#mission .clock { font: 600 30px/1 ui-monospace, Menlo, monospace; letter-spacing: 1px; }
#mission .clock.amber { color: #f2b705; } #mission .clock.red { color: #ff6b6b; } #mission .clock.over { color: #ff6b6b; }
#mission .score { font: 600 14px ui-monospace, Menlo, monospace; }
#mission .grp { margin: 6px 0 1px; font-weight: 600; opacity: .8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
#mission .row { display: flex; gap: 6px; opacity: .55; } #mission .row.on { opacity: 1; color: #7be38f; }
#mission .row .t { flex: 1; } #mission .row .p { font-family: ui-monospace, Menlo, monospace; }
#mission .hint { margin-top: 6px; font-size: 11px; opacity: .7; }
#mission .state { font-size: 11px; opacity: .8; margin-top: 2px; }
#minv { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.55); display: none; align-items: center; justify-content: center; }
#minv .box { background: #0e2a40; color: #fff; border-radius: 12px; padding: 14px 18px; min-width: 300px; max-width: 90vw; font: 14px -apple-system, system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.5); }
#minv h2 { margin: 0 0 4px; font-size: 16px; } #minv .sub { opacity: .75; font-size: 12px; margin-bottom: 8px; }
#minv .it { padding: 6px 10px; border-radius: 6px; cursor: pointer; } #minv .it.sel { background: #1d6f9f; } #minv .it:hover { background: #17577c; }
#minv .empty { opacity: .6; padding: 6px 2px; }`;

export function setupMissionHud({ backend, toast }) {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const panel = document.createElement("div"); panel.id = "mission"; panel.setAttribute("aria-label", "Mission score board and clock");
  panel.innerHTML = `<div class="top"><span class="clock" id="mclock">10:00</span><span class="score" id="mscore">0 / 0</span></div><div class="state" id="mstate"></div><div id="mlist"></div>
    <div class="hint">G: at the stairs the crew takes what the ROV carries; anywhere else it lets go of it &nbsp; Tab: inventory</div>`;
  document.body.appendChild(panel);
  const inv = document.createElement("div"); inv.id = "minv";
  inv.innerHTML = `<div class="box" role="dialog" aria-label="Inventory"><h2>Inventory</h2><div class="sub" id="minvsub"></div><div id="minvlist"></div><div class="sub" style="margin-top:8px">&uarr; &darr; choose, Enter gives it to the ROV, Esc or Tab closes</div></div>`;
  document.body.appendChild(inv);
  const $ = (id) => document.getElementById(id);
  let last = "", lastMsg = -1, items = [], sel = 0, open = false, cur = null;

  const render = (st) => {
    const b = st.board, sig = JSON.stringify(b.items.map((i) => i.earned));
    $("mscore").textContent = `${b.total} / ${b.max}`;
    if (sig !== last) {
      last = sig;
      let html = "", g = "";
      for (const i of b.items) {
        if (i.group !== g) { g = i.group; html += `<div class="grp">${g}</div>`; }
        html += `<div class="row${i.earned ? " on" : ""}"><span>${i.earned ? "✓" : "○"}</span><span class="t">${i.label}</span><span class="p">${i.points}</span></div>`;
      }
      $("mlist").innerHTML = html;
    }
    const c = st.clock;
    $("mclock").textContent = c.text;
    $("mclock").className = "clock" + (c.over ? " over" : c.state === "running" && c.remaining <= 30 ? " red" : c.state === "running" && c.remaining <= 120 ? " amber" : "");
    $("mstate").textContent = c.state === "ready" ? "Ready: the clock starts when the ROV moves" : c.over ? "OVERTIME: the clock keeps counting. Reset starts over." : st.carrying ? `Carrying: ${st.carrying}  (G lets go)` : "";
  };

  const drawInv = () => {
    $("minvsub").textContent = cur && cur.atStairs ? "The crew hands the ROV what it asks for." : "The ROV has to be at the stairs to be handed anything.";
    $("minvlist").innerHTML = items.length ? items.map((i, k) => `<div class="it${k === sel ? " sel" : ""}" data-k="${k}">${i.label}</div>`).join("") : `<div class="empty">Nothing on the deck yet.</div>`;
  };
  const show = (on) => { open = on; inv.style.display = on ? "flex" : "none"; if (on) { items = cur ? cur.inventory : []; sel = 0; drawInv(); } };
  const give = (k) => { const it = items[k]; if (!it) return; if (backend.missionGive(it.id)) show(false); else drawInv(); };
  inv.addEventListener("click", (e) => { const t = e.target.closest(".it"); if (t) give(Number(t.dataset.k)); else if (e.target === inv) show(false); });
  window.addEventListener("keydown", (e) => {                                   // (capture phase: while the inventory is open it gets the keys, the page does not)
    if (!open) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === "Escape" || e.code === "Tab") show(false);
    else if (e.code === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); drawInv(); }
    else if (e.code === "ArrowUp") { sel = Math.max(0, sel - 1); drawInv(); }
    else if (e.code === "Enter") give(sel);
  }, true);

  return {
    update(state) {
      const m = (state.props || []).find((p) => p.type === "mission");
      if (!m) return;
      cur = m; render(m);
      if (m.msg && m.msg.n !== lastMsg) { lastMsg = m.msg.n; if (m.msg.text) toast(m.msg.text); }
      if (open) { items = m.inventory; sel = Math.min(sel, Math.max(0, items.length - 1)); drawInv(); }
    },
    toggleInventory() { show(!open); },
    get modal() { return open; },
  };
}
