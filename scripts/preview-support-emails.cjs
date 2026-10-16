const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const {
  renderContactReceipt,
  renderSupportReply,
  renderAdminContact,
} = require('../dist/modules/contact/support-email.templates');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const output = path.resolve(option('--output', '/tmp/upsolve-email-previews'));
const base = 'https://upsolve-it.hnuicpc.tech';
const sample = {
  name: 'Alex',
  email: 'alex@example.com',
  subject: 'Trouble opening my training tabs',
  message:
    'Hi team,\n\nWhen I open my dashboard, I cannot switch between the training tabs. Could you help me get back to practicing?\n\nThanks,\nAlex',
  category: 'technical',
};
const samples = [
  {
    name: 'reply',
    subject: '[Upsolve.it preview] Support reply',
    email: renderSupportReply(
      sample,
      'Hi Alex,\n\nThanks for letting us know. The issue with the training tabs has been fixed, and you should now be able to move between them normally.\n\nPlease refresh the website and try opening your training again. If anything still looks wrong, let us know and we’ll take another look.\n\nHappy practicing,\nThe Upsolve.it team',
      base,
    ),
  },
  {
    name: 'receipt',
    subject: '[Upsolve.it preview] Message confirmation',
    email: renderContactReceipt(sample, base),
  },
  {
    name: 'admin',
    subject: '[Upsolve.it preview] Admin notification',
    email: renderAdminContact(sample, base),
  },
];

fs.mkdirSync(output, { recursive: true });
for (const sample of samples) {
  fs.writeFileSync(path.join(output, sample.name + '.html'), sample.email.html);
  fs.writeFileSync(path.join(output, sample.name + '.txt'), sample.email.text);
}
fs.writeFileSync(
  path.join(output, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upsolve.it email previews</title><body style="font-family:Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#26372d;background:#edf1e9"><h1>Support email previews</h1><p>Example content for reviewing the production templates.</p><ul>${samples.map((sample) => `<li style="margin:16px 0"><a href="${sample.name}.html">${sample.subject.replace('[Upsolve.it preview] ', '')}</a></li>`).join('')}</ul></body></html>`,
);
console.log('Generated email previews: ' + output);

async function sendPreviews() {
  const envPath = option('--env-file', '.env');
  const config = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath))
    : {};
  const sender = config.SMTP_EMAIL || process.env.SMTP_EMAIL;
  const password = config.SMTP_PASSWORD || process.env.SMTP_PASSWORD;
  if (!sender || !password)
    throw new Error('SMTP_EMAIL and SMTP_PASSWORD are required');
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: sender, pass: password },
    dnsTimeout: 10000,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  const only = option('--only', null);
  if (only && !samples.some((sample) => sample.name === only))
    throw new Error('--only must be reply, receipt, or admin');
  const accepted = [];
  try {
    for (const sample of samples.filter(
      (sample) => !only || sample.name === only,
    )) {
      const info = await transport.sendMail({
        from: { name: 'Upsolve.it Support', address: sender },
        to: sender,
        subject: sample.subject,
        ...sample.email,
      });
      if (!info.accepted.includes(sender) || info.rejected.length)
        throw new Error('Gmail did not accept the ' + sample.name + ' preview');
      const result = {
        template: sample.name,
        to: sender,
        messageId: info.messageId,
        accepted: true,
      };
      accepted.push(result);
      fs.appendFileSync(
        path.join(output, 'sent-previews.jsonl'),
        JSON.stringify(result) + '\n',
        { mode: 0o600 },
      );
      console.log(JSON.stringify(result));
    }
  } finally {
    transport.close();
  }
  console.log('Sent ' + accepted.length + ' preview emails to ' + sender);
}

if (args.includes('--send-to-self')) {
  sendPreviews().catch((error) => {
    console.error('Preview send failed: ' + (error.code || error.message));
    process.exitCode = 1;
  });
}
