import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
};

@Injectable()
export class ContactService {
  constructor(private readonly config: ConfigService) {}

  private transporter() {
    const email = this.config.get<string>('SMTP_EMAIL');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    if (!email || !pass) {
      throw new ServiceUnavailableException(
        'Email service is not configured. Please contact us directly.',
      );
    }
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: email, pass },
    });
  }

  async sendContactEmail(data: ContactFormData) {
    const smtpEmail = this.config.get<string>('SMTP_EMAIL')!;
    const transporter = this.transporter();

    const emailContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 24px; background-color: #ffffff; color: #0f172a;">
        <div style="margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.025em; color: #007F5F; margin: 0;">Upsolve.it <span style="font-weight: 400; opacity: 0.7;">Support</span></h1>
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 4px;">Inbound Signal: ${data.category.toUpperCase()}</p>
        </div>

        <div style="background-color: #f8fafc; padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid #f1f5f9;">
          <p style="margin: 0 0 12px 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Name</strong><br/><span style="font-weight: 600;">${data.name}</span></p>
          <p style="margin: 0 0 12px 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Email</strong><br/><span style="font-weight: 600;">${data.email}</span></p>
          <p style="margin: 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Subject</strong><br/><span style="font-weight: 600;">${data.subject}</span></p>
        </div>

        <div style="margin-bottom: 32px;">
          <strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">Message</strong>
          <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${data.message}</div>
        </div>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
          Upsolve.it Support • HNU ICPC COMMUNITY
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${data.name} [${data.email}]" <${smtpEmail}>`,
      to: smtpEmail,
      replyTo: data.email,
      subject: `[SIGNAL] ${data.category.toUpperCase()}: ${data.subject}`,
      html: emailContent,
    });

    await transporter.sendMail({
      from: `"Upsolve.it" <${smtpEmail}>`,
      to: data.email,
      subject: 'Transmission Received: Upsolve.it Support',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 24px; background-color: #ffffff; color: #0f172a;">
          <h2 style="font-size: 20px; font-weight: 800; text-transform: uppercase; color: #007F5F; margin: 0 0 16px 0;">Transmission Received</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${data.name}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">Your signal has been successfully logged at our intelligence center. Our community engineers will analyze your transmission and initiate a return link within 24-48 cycles.</p>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 16px; margin: 24px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Logged Subject:</strong> ${data.subject}</p>
          </div>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">In the meantime, you can access the core documentation at <a href="https://docs.hnuicpc.tech" style="color: #007F5F; text-decoration: none; font-weight: 600;">docs.hnuicpc.tech</a>.</p>
          <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
            Secure Link Established • Upsolve.it
          </div>
        </div>
      `,
    });
  }
}
