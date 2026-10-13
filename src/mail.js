// Email through Resend. Settings (Cloudflare → Workers & Pages → zion4life → Settings →
// Variables and Secrets): RESEND_API_KEY (Secret) and FROM_EMAIL_ADDRESS, a sender on a
// domain verified in Resend, e.g. "有光 <hello@zion4life.faith>".
// Without both, emails are skipped (logged) and everything else keeps working.
import { esc } from './md.js';
import { base64 } from './util.js';

export const mailReady = (env) => !!(env.RESEND_API_KEY && env.FROM_EMAIL_ADDRESS);

// attachments: [{ filename, content (string), type }]
export async function sendMail(env, { to, subject, html, text, attachments, replyTo }) {
  if (!mailReady(env)) {
    console.log('[mail] skipped (not configured):', subject);
    return { ok: false, skipped: true };
  }
  const body = { from: env.FROM_EMAIL_ADDRESS, to: [to], subject, html, text };
  if (replyTo) body.reply_to = replyTo;
  if (attachments?.length) {
    body.attachments = attachments.map((a) => ({ filename: a.filename, content: base64(new TextEncoder().encode(a.content)), content_type: a.type }));
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error('[mail] failed', r.status, await r.text().catch(() => ''));
  return { ok: r.ok };
}

// One simple, readable layout for every email, in the reader's language.
export function layout({ lang = 'zh', title, lines, big, button, footer }) {
  const brand = lang === 'en' ? 'Light · zion4life.faith' : '有光 · zion4life.faith';
  const html = `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><body style="margin:0;background:#eaf6ff;padding:24px 12px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1b2a38">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:28px 24px">
<p style="margin:0 0 18px;font-size:14px;font-weight:600;color:#1f6f99">${esc(brand)}</p>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.5">${esc(title)}</h1>
${big ? `<p style="margin:6px 0 18px;font-size:34px;font-weight:700;letter-spacing:.18em;color:#1b2a38">${esc(big)}</p>` : ''}
${lines.filter(Boolean).map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.8">${esc(l)}</p>`).join('')}
${button ? `<p style="margin:22px 0 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#2a8fc4;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${esc(button.label)}</a></p>` : ''}
${footer ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#5a6d80">${footer}</p>` : ''}
</div></body></html>`;
  const text = [title, '', big || '', ...lines.filter(Boolean), button ? `${button.label}: ${button.url}` : ''].filter((x, i) => x || i === 1).join('\n');
  return { html, text };
}

// Questions from the 有问题想问 box go to Zion. Uses the Cloudflare Email Routing
// binding ASK_MAIL (send_email, destination = Zion's verified address) when it exists,
// otherwise Resend if configured. Returns true when an email went out.
export async function sendAsk(env, ask) {
  const to = env.ASK_TO || 'zion.chen@hotmail.com';
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
      const raw = mime({ from: env.ASK_FROM, to, replyTo: ask.reply, subject, text });
      await env.ASK_MAIL.send(new EmailMessage(env.ASK_FROM, to, raw));
      return true;
    }
    if (mailReady(env)) {
      const r = await sendMail(env, { to, subject, text, replyTo: ask.reply || undefined, html: `<pre style="font:15px/1.7 -apple-system,sans-serif;white-space:pre-wrap">${esc(text)}</pre>` });
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
  return [
    `From: =?UTF-8?B?${b64('有光')}?= <${from}>`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@zion4life.faith>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}
