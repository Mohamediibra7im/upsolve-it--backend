import {
  renderContactReceipt,
  renderAdminContact,
  renderSupportReply,
} from './support-email.templates';

const message = {
  name: 'Alex',
  email: 'alex@example.com',
  subject: 'Website issue',
  message: 'I cannot open the other tabs.\nCan you help?',
  category: 'technical',
};

describe('support email templates', () => {
  it('includes the original subject and message in the receipt and plain text', () => {
    const email = renderContactReceipt(message);
    expect(email.html).toContain('Website issue');
    expect(email.html).toContain(
      'I cannot open the other tabs.<br />Can you help?',
    );
    expect(email.text).toContain('Hi Alex,');
    expect(email.text).toContain(message.message);
    expect(email.text).toContain('24–48 hours');
  });

  it('keeps the exact reply without adding another greeting', () => {
    const email = renderSupportReply(
      message,
      'Hi Alex,\n\nThe tabs now work.\n\nSupport Team',
    );
    expect(email.html.match(/Hi Alex,/g)).toHaveLength(1);
    expect(email.html).not.toContain('Hello Alex');
    expect(email.html).toContain('Your original message');
    expect(email.text).toContain('Hi Alex,\n\nThe tabs now work.');
    expect(email.text).toContain(message.message);
  });

  it('lets admins identify the sender and open the configured support inbox', () => {
    const email = renderAdminContact(message, 'https://community.example.com/');
    expect(email.html).toContain('alex@example.com');
    expect(email.html).toContain('Technical support');
    expect(email.html).toContain(
      'href="https://community.example.com/admin/contact"',
    );
    expect(email.text).toContain('https://community.example.com/admin/contact');
  });

  it.each([renderContactReceipt, renderAdminContact])(
    'escapes untrusted contact data in %p',
    (render) => {
      const email = render({
        ...message,
        name: '<img src=x onerror=alert(1)>',
        subject: '<script>alert(1)</script>',
        category: '<svg onload=alert(1)>',
        message: 'A & B\r\n<a href="javascript:alert(1)">click</a>',
      });
      expect(email.html).not.toContain('<script>');
      expect(email.html).not.toContain('<img src=x');
      expect(email.html).not.toContain('<svg onload');
      expect(email.html).toContain('&lt;script&gt;');
      expect(email.html).toContain('A &amp; B<br />&lt;a');
    },
  );

  it('escapes reply HTML while preserving newlines and Unicode', () => {
    const email = renderSupportReply(
      message,
      '<img src=x>\nتم حل المشكلة & thanks.',
    );
    expect(email.html).not.toContain('<img src=x>');
    expect(email.html).toContain(
      '&lt;img src=x&gt;<br />تم حل المشكلة &amp; thanks.',
    );
    expect(email.text).toContain('<img src=x>\nتم حل المشكلة & thanks.');
  });

  it.each([
    'javascript:alert(1)',
    'not a url',
    'https://user:password@example.com',
  ])('uses safe public links when APP_URL is invalid: %s', (appUrl) => {
    const email = renderContactReceipt(message, appUrl);
    expect(email.html).toContain('href="https://upsolve-it.hnuicpc.tech/"');
    expect(email.html).not.toContain('href="javascript:');
    expect(email.html).not.toContain('user:password');
  });
});
