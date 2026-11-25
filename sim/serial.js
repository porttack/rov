// serial.js — the browser half of the micro:bit / Pico link: Web Serial (Chrome, Edge, ChromeOS), the toolbar button and a small log.
// The protocol itself (what the lines mean, rate limits, "zero the thrusters when the cable goes") is sim/devicelink.js.
// Needs: a Chromium browser, https or http://localhost, a click to pick the port, and nothing else holding the port (MakeCode,
// Thonny, another tab...). A school-managed Chromebook can switch Web Serial off by policy.
import { LineSplitter } from "./sim/devicelink.js";

const FILTERS = [{ usbVendorId: 0x0d28 }, { usbVendorId: 0x2e8a }];     // micro:bit, Raspberry Pi (Pico)
const BAUD = 115200;
const LOG_LINES = 7;

export function serialSupport() {
  if (!("serial" in navigator)) return "This browser has no Web Serial. Use Chrome or Edge (or a Chromebook).";
  if (!window.isSecureContext) return "Web Serial needs https:// or http://localhost.";
  return null;
}

/** Wire a DeviceLink to a button and a log panel. Returns nothing; everything happens through the button. */
export function setupSerial({ link, button, panel }) {
  const problem = serialSupport();
  const lines = [];
  let port = null, reader = null, writer = null, writing = Promise.resolve(), connected = false, closing = false;
  const enc = new TextEncoder();

  const label = (text, title) => { button.textContent = text; if (title) button.title = title; };
  const show = (dir, line) => {
    lines.push(`${dir === "in" ? "←" : dir === "out" ? "→" : "·"} ${line}`);
    while (lines.length > LOG_LINES) lines.shift();
    panel.textContent = lines.join("\n");
    panel.style.display = "block";
  };
  link.onActivity = show;

  if (problem) {                                     // still show the button, so students learn why it does not work
    label("Connect micro:bit / Pico", problem);
    button.classList.add("off");
    button.addEventListener("click", () => { panel.style.display = "block"; panel.textContent = problem; });
    return;
  }
  label("Connect micro:bit / Pico", "Drive the ROV from a micro:bit or Pico plugged in with USB (Shift-click to choose any serial device). The Help page explains the protocol.");

  async function cleanup(message) {
    if (!connected && !port) return;
    const wasConnected = connected;
    connected = false;
    link.disconnected();                             // thrusters to zero, subscriptions forgotten
    try { reader && (await reader.cancel().catch(() => {})); reader && reader.releaseLock(); } catch (e) { /* already gone */ }
    try { writer && writer.releaseLock(); } catch (e) { /* already gone */ }
    try { port && (await port.close()); } catch (e) { /* already closed */ }
    port = reader = writer = null;
    button.classList.remove("on");
    label("Connect micro:bit / Pico", "Drive the ROV from a micro:bit or Pico plugged in with USB");
    if (wasConnected || message) show("note", message || "disconnected: thrusters stopped");
  }

  async function open(p) {
    try {
      await p.open({ baudRate: BAUD });
    } catch (e) {
      show("note", /open|busy|in use|NetworkError/i.test(String(e)) ? "Could not open the port: close MakeCode, Thonny or other tabs using it, then try again." : `Could not open the port: ${e.message || e}`);
      return false;
    }
    port = p; closing = false; connected = true;
    writer = p.writable.getWriter();
    link.send = (line) => {                          // one write at a time; a failed write means the cable is gone
      writing = writing.then(() => writer && writer.write(enc.encode(line + "\n"))).catch(() => { if (connected) cleanup("lost the device: thrusters stopped"); });
    };
    button.classList.add("on");
    label("Device connected (click to disconnect)", "Click to disconnect");
    show("note", "connected: send p:t1,0.5 ... (see Help, #microcontrollers)");
    readLoop(p);
    return true;
  }

  async function readLoop(p) {
    const dec = new TextDecoder();
    const splitter = new LineSplitter();
    try {
      reader = p.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of splitter.feed(dec.decode(value, { stream: true }))) link.onLine(line, performance.now());
      }
    } catch (e) { /* unplugged or errored: fall through to cleanup */ }
    if (connected) await cleanup("lost the device: thrusters stopped");
  }

  button.addEventListener("click", async (ev) => {
    if (connected) { closing = true; await cleanup("disconnected: thrusters stopped"); return; }
    try {
      const p = await navigator.serial.requestPort(ev.shiftKey ? {} : { filters: FILTERS });
      await open(p);
    } catch (e) {
      if (e && e.name !== "NotFoundError") show("note", `No port chosen: ${e.message || e}`);     // NotFoundError = the user cancelled the picker
    }
  });

  navigator.serial.addEventListener("disconnect", (ev) => { if (connected && ev.target === port) cleanup("unplugged: thrusters stopped"); });

  // a port this page was allowed to use before: reconnect without asking (when exactly one is known)
  navigator.serial.getPorts().then((ports) => { if (ports.length === 1 && !connected) open(ports[0]); }).catch(() => {});
  window.addEventListener("pagehide", () => { if (connected) link.disconnected(); });
}
