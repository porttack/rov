// mdrender.js — a tiny Markdown-to-HTML renderer for help.md (no libraries, no CDN: school filters block those). No DOM, tested in Node.
// Supports: # headings (with {#custom-id} or an automatic id), paragraphs, - / 1. lists, | tables |, ``` code blocks, > quotes, ---,
// and inline `code`, **bold**, *italic*, [links](url). Everything is HTML-escaped first, and links may only be http(s), relative or #anchors.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function slug(text) {
  return text.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}

const safeUrl = (u) => /^(https?:\/\/|#|[./a-z0-9_-]+(\.[a-z0-9]+)?(\?[\w=&%.,-]*)?(#[\w-]*)?$)/i.test(u) && !/^\s*javascript:/i.test(u);

export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = url.replace(/&amp;/g, "&");
    return safeUrl(u) ? `<a href="${esc(u)}"${/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function render(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [], ids = new Set();
  let i = 0;
  const uniqueId = (base) => { let id = base, n = 2; while (ids.has(id)) id = `${base}-${n++}`; ids.add(id); return id; };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^```\s*([\w-]*)\s*$/))) {                                   // fenced code
      const code = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code${m[1] ? ` class="lang-${esc(m[1])}"` : ""}>${esc(code.join("\n"))}</code></pre>`);
    } else if ((m = line.match(/^(#{1,4})\s+(.*?)\s*(\{#([\w-]+)\})?\s*$/))) {       // heading
      const level = m[1].length, id = uniqueId(m[4] || slug(m[2].replace(/`/g, "")));
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("<hr>"); i++; }
    else if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {   // table
      const head = cells(line);
      let html = "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) {
        const row = cells(lines[i]);
        html += "<tr>" + head.map((_, k) => `<td>${inline(row[k] ?? "")}</td>`).join("") + "</tr>";
      }
      out.push(html + "</tbody></table>");
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {                                    // list
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      for (; i < lines.length && lines[i].trim(); i++) {
        const mm = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        if (mm) items.push(mm[1]);
        else if (/^\s+\S/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();   // wrapped continuation
        else break;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else if (line.startsWith(">")) {                                                // quote
      const q = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) q.push(lines[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
    } else {                                                                          // paragraph
      const p = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i]) && !(lines[i].includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")); i++) p.push(lines[i].trim());
      out.push(`<p>${inline(p.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

/** [{id, text, level}] for the headings of a rendered document's source (for the "on this page" list). */
export function outline(md) {
  return [...render(md).matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)].map((m) => ({ level: +m[1], id: m[2], text: m[3].replace(/<[^>]+>/g, "") }));
}
