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
<p style="margin:0 0 18px;font-weight:600;color:#1f6f99">有光</p>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.5">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.8">${esc(l)}</p>`).join('')}
${button ? `<p style="margin:22px 0 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#2a8fc4;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${esc(button.label)}</a></p>` : ''}
${footer ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#687176">${footer}</p>` : ''}
</div></body></html>`;
  const text = [title, '', ...lines, button ? `${button.label}：${button.url}` : ''].join('\n');
  return { html, text };
}

// Questions from the 有问题想问 box go to Zion. Uses the Cloudflare Email Routing
// binding ASK_MAIL (send_email, destination = Zion's verified address) when it exists,
// otherwise Resend if configured. Returns true when an email went out.
export async function sendAsk(env, ask) {
  const subject = `有光网站来信${ask.name ? `：${ask.name}` : ''}`;
  const text = [
    ask.message, '',
    `称呼：${ask.name || '（没填）'}`,
    `回信邮箱：${ask.reply || '（没填）'}`,
    `页面：${ask.page || ''}（${ask.lang === 'en' ? '英文' : '中文'}）`,
  ].join('\n');
  try {
    if (env.ASK_MAIL && env.ASK_FROM) {
      const { EmailMessage } = await import('cloudflare:email');
      const raw = mime({ from: env.ASK_FROM, to: env.ASK_TO || 'zion.chen@hotmail.com', replyTo: ask.reply, subject, text });
      await env.ASK_MAIL.send(new EmailMessage(env.ASK_FROM, env.ASK_TO || 'zion.chen@hotmail.com', raw));
      return true;
    }
    if (mailReady(env) && env.ASK_TO) {
      const r = await sendMail(env, { to: env.ASK_TO, subject, text, html: `<pre style="font:15px/1.7 -apple-system,sans-serif;white-space:pre-wrap">${esc(text)}</pre>` });
      return !!r.ok;
    }
  } catch (e) {
    console.error('[ask mail]', e?.stack || e);
  }
  console.log('[ask] stored, not emailed (mail not set up)');
  return false;
}
// A minimal UTF-8 plain-text email for the send_email binding.
function mime({ from, to, replyTo, subject, text }) {
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const id = `<${crypto.randomUUID()}@zion4life.faith>`;
  return [
    `From: 有光 <${from}>`.replace('有光', `=?UTF-8?B?${b64('有光')}?=`),
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: ${id}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text).replace(/.{76}/g, '$&\r\n'),
  ].filter((l, i) => l !== '' || i > 8).join('\r\n');
}
