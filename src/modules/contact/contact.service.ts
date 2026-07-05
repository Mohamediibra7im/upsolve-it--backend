import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import {
  ContactMessage,
  type ContactMessageDocument,
} from './schemas/contact-message.schema';

// ponytail: stdlib escape, no dep needed.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
};

@Injectable()
export class ContactService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(ContactMessage.name)
    private readonly contactModel: Model<ContactMessageDocument>,
  ) {}

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
    // ponytail: store every contact submission so admin can review in panel.
    await this.contactModel.create(data);

    const smtpEmail = this.config.get<string>('SMTP_EMAIL')!;
    const transporter = this.transporter();

    const escName = esc(data.name);
    const escEmail = esc(data.email);
    const escSubject = esc(data.subject);
    const escMessage = esc(data.message);
    const escCategory = esc(data.category);

    const emailContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 24px; background-color: #ffffff; color: #0f172a;">
        <div style="margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.025em; color: #007F5F; margin: 0;">Upsolve.it <span style="font-weight: 400; opacity: 0.7;">Support</span></h1>
          <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 4px;">Inbound Signal: ${escCategory.toUpperCase()}</p>
        </div>

        <div style="background-color: #f8fafc; padding: 24px; border-radius: 16px; margin-bottom: 32px; border: 1px solid #f1f5f9;">
          <p style="margin: 0 0 12px 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Name</strong><br/><span style="font-weight: 600;">${escName}</span></p>
          <p style="margin: 0 0 12px 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Email</strong><br/><span style="font-weight: 600;">${escEmail}</span></p>
          <p style="margin: 0;"><strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Subject</strong><br/><span style="font-weight: 600;">${escSubject}</span></p>
        </div>

        <div style="margin-bottom: 32px;">
          <strong style="font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; display: block; margin-bottom: 12px;">Message</strong>
          <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${escMessage}</div>
        </div>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
          Upsolve.it Support • HNU ICPC COMMUNITY
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${escName} [${escEmail}]" <${smtpEmail}>`,
      to: smtpEmail,
      replyTo: data.email,
      subject: `[SIGNAL] ${escCategory.toUpperCase()}: ${escSubject}`,
      html: emailContent,
    });

    await transporter.sendMail({
      from: `"Upsolve.it" <${smtpEmail}>`,
      to: data.email,
      subject: 'Transmission Received: Upsolve.it Support',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 24px; background-color: #ffffff; color: #0f172a;">
          <h2 style="font-size: 20px; font-weight: 800; text-transform: uppercase; color: #007F5F; margin: 0 0 16px 0;">Transmission Received</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${escName}</strong>,</p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">Your signal has been successfully logged at our intelligence center. Our community engineers will analyze your transmission and initiate a return link within 24-48 cycles.</p>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 16px; margin: 24px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Logged Subject:</strong> ${escSubject}</p>
          </div>

          <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
            Secure Link Established • Upsolve.it
          </div>
        </div>
      `,
    });

    // ponytail: notify admin when new support message arrives.
    const notifyEmail = this.config.get<string>('NOTIFICATION_EMAIL');
    if (notifyEmail && notifyEmail !== smtpEmail) {
      await transporter.sendMail({
        from: `"Upsolve.it Support" <${smtpEmail}>`,
        to: notifyEmail,
        subject: `[Admin] New support message from ${escName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; padding: 24px;">
            <p><strong>From:</strong> ${escName} (${escEmail})</p>
            <p><strong>Subject:</strong> ${escSubject}</p>
            <p><strong>Category:</strong> ${escCategory}</p>
            <hr/>
            <p>${escMessage.replace(/\n/g, '<br/>')}</p>
            <hr/>
            <p style="font-size: 12px; color: #666;">
              Reply from the admin panel at /admin/contact.
            </p>
          </div>
        `,
      });
    }
  }

  async listMessages(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.contactModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.contactModel.countDocuments({}),
    ]);
    return { messages, total, page, limit };
  }

  async markAsRead(id: string) {
    return this.contactModel
      .findByIdAndUpdate(id, { read: true }, { new: true })
      .lean();
  }

  async sendReply(id: string, replyBody: string) {
    const msg = await this.contactModel.findById(id).lean();
    if (!msg) throw new Error('Message not found');

    const smtpEmail = this.config.get<string>('SMTP_EMAIL')!;
    const transporter = this.transporter();

    const escReplyName = esc(msg.name);
    const escReplyMessage = esc(msg.message);
    const escReplyBody = esc(replyBody);

    await transporter.sendMail({
      from: `"Upsolve.it Support" <${smtpEmail}>`,
      to: msg.email,
      subject: `Re: ${msg.subject}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 24px; background-color: #ffffff; color: #0f172a;">
          <h2 style="font-size: 20px; font-weight: 800; text-transform: uppercase; color: #007F5F; margin: 0 0 16px 0;">Reply from Upsolve.it</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">Hello <strong>${escReplyName}</strong>,</p>
          <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap; margin: 16px 0;">${escReplyBody}</div>
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 32px;">
            <p style="font-size: 12px; color: #94a3b8;">Your original message:</p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-top: 8px; border: 1px solid #f1f5f9;">
              <p style="font-size: 13px; color: #64748b; white-space: pre-wrap;">${escReplyMessage}</p>
            </div>
          </div>
          <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
            Upsolve.it Support • HNU ICPC COMMUNITY
          </div>
        </div>
      `,
    });

    return { success: true };
  }

  async deleteMessage(id: string) {
    return this.contactModel.findByIdAndDelete(id).lean();
  }
}
