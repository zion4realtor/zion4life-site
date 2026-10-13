// Simple Markdown used for every piece of writing on the site (build.mjs) and for posts
// written by tag managers (rendered by the Worker): ## headings, paragraphs, > verse (last
// line "—— reference"), - lists, 1. lists, ---, **bold**, *italic*, [links](url), ![images](url).
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Only http(s), site-relative and mailto links survive.
const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/)|mailto:)/i.test(u) ? u : '#');
function inline(s) {
  let h = esc(s);
  h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img src="${safeUrl(u)}" alt="${a}" loading="lazy">`);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const url = safeUrl(u);
    return `<a href="${url}"${/^https?:/.test(url) ? ' rel="noopener" target="_blank"' : ''}>${t}</a>`;
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return h;
}
// Join wrapped lines: no space between Chinese characters, one space between Latin words.
function joinLines(lines) {
  return lines.reduce((acc, l) => {
    l = l.trim();
    if (!acc) return l;
    const a = acc.slice(-1), b = l[0];
    return acc + (/[\x21-\x7e]/.test(a) && /[\x21-\x7e]/.test(b) ? ' ' : '') + l;
  }, '');
}
export function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  const special = /^(#{2,4}\s|>|[-*]\s|\d+[.、]\s|---+\s*$)/;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) {
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
    } else if (/^---+\s*$/.test(l)) {
      out.push('<hr>');
      i++;
    } else if (l.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      let cite = '';
      if (q.length > 1 && /^(——|—|--)/.test(q[q.length - 1].trim())) cite = q.pop().trim().replace(/^(——|—|--)\s*/, '');
      out.push(`<blockquote class="verse"><p>${q.map(inline).join('<br>')}</p>${cite ? `<cite>${inline(cite)}</cite>` : ''}</blockquote>`);
    } else if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ''));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
    } else if (/^\d+[.、]\s*/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+[.、]\s*/.test(lines[i])) items.push(lines[i++].replace(/^\d+[.、]\s*/, ''));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
    } else {
      const p = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !special.test(lines[i])) p.push(lines[i++]);
      out.push(`<p>${inline(joinLines(p))}</p>`);
    }
  }
  return out.join('\n');
}
export const plain = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
export function readMinutes(text) {
  const cjk = (text.match(/[㐀-鿿]/g) || []).length;
  const words = (text.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
  return Math.max(1, Math.round(cjk / 380 + words / 220));
}
