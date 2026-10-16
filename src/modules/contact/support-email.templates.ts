export type ContactEmailData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
};

export type SupportEmail = { html: string; text: string };

const DEFAULT_APP_URL = 'https://upsolve-it.hnuicpc.tech';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function lines(value: string): string {
  return esc(value.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br />');
}

function appOrigin(appUrl?: string): string {
  try {
    const url = new URL(appUrl ?? DEFAULT_APP_URL);
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    // An optional misconfigured link must not prevent email delivery.
  }
  return DEFAULT_APP_URL;
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    general: 'General question',
    bug: 'Bug report',
    feature: 'Feature request',
    account: 'Account help',
    technical: 'Technical support',
  };
  return Object.hasOwn(labels, category) ? labels[category] : category;
}

function topic(subject: string): string {
  return `<p class="muted" style="margin:12px 0 28px;color:#59665d;font-size:14px;line-height:22px;overflow-wrap:anywhere;word-break:break-word;">Regarding <strong class="ink" style="color:#26372d;font-weight:600;">${esc(subject)}</strong></p>`;
}

function messageBlock(message: string): string {
  return `<p dir="auto" class="ink" style="margin:0;color:#26372d;font-size:16px;line-height:27px;overflow-wrap:anywhere;word-break:break-word;">${lines(message)}</p>`;
}

function quote(subject: string, message: string, label: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;margin-top:28px;">
      <tr><td class="divider" style="border-top:1px solid #e1e7df;padding-top:24px;">
        <p class="muted" style="margin:0 0 10px;color:#59665d;font-size:13px;line-height:20px;">${esc(label)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="quote" bgcolor="#f3f6f0" style="width:100%;table-layout:fixed;background-color:#f3f6f0;">
          <tr><td style="padding:20px;">
            <p dir="auto" class="ink" style="margin:0 0 10px;color:#26372d;font-size:14px;line-height:22px;font-weight:600;overflow-wrap:anywhere;word-break:break-word;">${esc(subject)}</p>
            <p dir="auto" class="muted" style="margin:0;color:#59665d;font-size:14px;line-height:23px;overflow-wrap:anywhere;word-break:break-word;">${lines(message)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`;
}

function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
    <tr><td bgcolor="#b5e3c4" style="background-color:#b5e3c4;border-radius:8px;mso-padding-alt:14px 22px;">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 22px;color:#142b1d;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

function layout(options: {
  title: string;
  preheader: string;
  body: string;
  footerNote: string;
  base: string;
}): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(options.title)} — Upsolve.it</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    table { border-collapse:collapse; }
    a:focus-visible { outline:2px solid #007f5f; outline-offset:4px; }
    @media screen and (max-width:600px) {
      .outer { padding:16px 8px !important; }
      .header { padding:24px !important; }
      .content { padding:30px 24px !important; }
      .footer { padding:24px !important; }
      .title { font-size:28px !important; line-height:34px !important; }
    }
    @media (prefers-color-scheme:dark) {
      body, .canvas { background-color:#101714 !important; }
      .sheet { background-color:#19231d !important; }
      .ink { color:#edf3ec !important; }
      .muted { color:#bdc9bd !important; }
      .quote, .footer { background-color:#222f26 !important; }
      .divider, .footer { border-color:#38493c !important; }
      .footer-link { color:#b5e3c4 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#edf1e9;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(options.preheader)}</div>
  <table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" bgcolor="#edf1e9" style="width:100%;background-color:#edf1e9;">
    <tr><td align="center" class="outer" style="padding:40px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sheet" bgcolor="#ffffff" style="width:100%;max-width:600px;table-layout:fixed;background-color:#ffffff;">
        <tr><td bgcolor="#b5e3c4" height="4" style="height:4px;line-height:4px;font-size:0;background-color:#b5e3c4;">&nbsp;</td></tr>
        <tr><td class="header" bgcolor="#14231a" style="padding:28px 32px;background-color:#14231a;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td><a href="${esc(options.base)}/" style="font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.6px;color:#f1f3ee;text-decoration:none;">Upsolve<span style="color:#b5e3c4;">.it</span></a></td>
              <td align="right" style="color:#b5c6b9;font-size:13px;line-height:20px;">Support</td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="content" style="padding:36px 32px;">
          <h1 class="title ink" style="margin:0;color:#1e3125;font-size:32px;line-height:39px;font-weight:700;letter-spacing:-0.8px;">${esc(options.title)}</h1>
          ${options.body}
        </td></tr>
        <tr><td class="footer" bgcolor="#f6f8f3" style="padding:24px 32px;border-top:1px solid #e1e7df;background-color:#f6f8f3;">
          <p class="muted" style="margin:0 0 8px;color:#59665d;font-size:12px;line-height:19px;">${esc(options.footerNote)}</p>
          <p class="muted" style="margin:0;color:#59665d;font-size:12px;line-height:19px;">Upsolve.it · HNU ICPC Community<br />
            <a class="footer-link" href="${esc(options.base)}/help" style="color:#245c3a;text-decoration:underline;">Help center</a>
            &nbsp;·&nbsp;
            <a class="footer-link" href="${esc(options.base)}/" style="color:#245c3a;text-decoration:underline;">Visit Upsolve.it</a>
          </p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderContactReceipt(
  data: ContactEmailData,
  appUrl?: string,
): SupportEmail {
  const base = appOrigin(appUrl);
  return {
    html: layout({
      title: 'Message received.',
      preheader:
        'Thanks for reaching out. We’ll get back to you within 24–48 hours.',
      base,
      footerNote:
        'You received this email because you contacted Upsolve.it Support.',
      body: `${topic(data.subject)}
        ${messageBlock(`Hi ${data.name},\n\nThanks for reaching out. We’ve received your message, and our team will get back to you within 24–48 hours.`)}
        ${quote(data.subject, data.message, 'A copy of your message')}
        ${button(`${base}/`, 'Back to Upsolve.it')}`,
    }),
    text: `Message received.\n\nHi ${data.name},\n\nThanks for reaching out. We’ve received your message, and our team will get back to you within 24–48 hours.\n\nYour message: ${data.subject}\n${data.message}\n\nBack to Upsolve.it: ${base}/\nHelp center: ${base}/help\n\nUpsolve.it Support · HNU ICPC Community`,
  };
}

export function renderSupportReply(
  data: ContactEmailData,
  replyBody: string,
  appUrl?: string,
): SupportEmail {
  const base = appOrigin(appUrl);
  return {
    html: layout({
      title: 'You have a reply.',
      preheader: `Our support team has replied about ${data.subject}.`,
      base,
      footerNote:
        'This email is part of your conversation with Upsolve.it Support.',
      body: `${topic(data.subject)}${messageBlock(replyBody)}
        ${button(`${base}/`, 'Open Upsolve.it')}
        ${quote(data.subject, data.message, 'Your original message')}`,
    }),
    text: `You have a reply.\nRegarding: ${data.subject}\n\n${replyBody}\n\nOpen Upsolve.it: ${base}/\n\nYour original message: ${data.subject}\n${data.message}\n\nHelp center: ${base}/help\nUpsolve.it Support · HNU ICPC Community`,
  };
}

export function renderAdminContact(
  data: ContactEmailData,
  appUrl?: string,
): SupportEmail {
  const base = appOrigin(appUrl);
  const category = categoryLabel(data.category);
  return {
    html: layout({
      title: 'A new support message.',
      preheader: `${data.name} sent a message about ${data.subject}.`,
      base,
      footerNote: 'Review and reply to this message in the support inbox.',
      body: `${topic(data.subject)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;margin-bottom:24px;">
          <tr><td class="muted" style="padding:0 0 8px;color:#59665d;font-size:14px;line-height:22px;overflow-wrap:anywhere;word-break:break-word;"><strong class="ink" style="color:#26372d;">From</strong> &nbsp;${esc(data.name)} · ${esc(data.email)}</td></tr>
          <tr><td class="muted" style="color:#59665d;font-size:14px;line-height:22px;overflow-wrap:anywhere;word-break:break-word;"><strong class="ink" style="color:#26372d;">Category</strong> &nbsp;${esc(category)}</td></tr>
        </table>
        ${messageBlock(data.message)}
        ${button(`${base}/admin/contact`, 'Open support inbox')}`,
    }),
    text: `A new support message.\n\nFrom: ${data.name} (${data.email})\nCategory: ${category}\nSubject: ${data.subject}\n\n${data.message}\n\nOpen support inbox: ${base}/admin/contact\n\nUpsolve.it Support · HNU ICPC Community`,
  };
}
