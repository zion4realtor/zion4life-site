// Email through Resend. Settings (Cloudflare → Workers & Pages → zion4life → Settings →
// Variables and Secrets): RESEND_API_KEY (Secret) and FROM_EMAIL_ADDRESS, a sender on a
// domain verified in Resend, e.g. "Zion4Life <hello@mail.zion4life.faith>".
// Without both, emails are skipped (logged) and everything else keeps working.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const mailReady = (env) => !!(env.RESEND_API_KEY && env.FROM_EMAIL_ADDRESS);

export async function sendMail(env, { to, subject, html, text, attachments }) {
  if (!mailReady(env)) {
    console.log('[mail] skipped (not configured):', subject);
    return { ok: false, skipped: true };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL_ADDRESS, to: [to], subject, html, text, attachments }),
  });
  if (!r.ok) console.error('[mail] failed', r.status, await r.text().catch(() => ''));
  return { ok: r.ok };
}

// One simple, readable layout for every email.
export function layout({ title, lines, button, footer }) {
  const html = `<!doctype html><html><body style="margin:0;background:#eff3f1;padding:24px 12px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#23272b">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 24px">
<p style="margin:0 0 18px;font-weight:600;color:#2e6a5b">Zion4Life</p>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.5">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.8">${esc(l)}</p>`).join('')}
${button ? `<p style="margin:22px 0 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#2e6a5b;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${esc(button.label)}</a></p>` : ''}
${footer ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#687176">${footer}</p>` : ''}
</div></body></html>`;
  const text = [title, '', ...lines, button ? `${button.label}：${button.url}` : ''].join('\n');
  return { html, text };
}
