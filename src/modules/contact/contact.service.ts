import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import {
  ContactMessage,
  type ContactReply,
  type ContactMessageDocument,
} from './schemas/contact-message.schema';

import {
  renderAdminContact,
  renderContactReceipt,
  renderSupportReply,
} from './support-email.templates';

// Strip CR/LF so user-controlled values can't inject extra mail headers
// when placed into From/Subject/Reply-To.
function headerSafe(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
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
    await this.contactModel.create(data);

    const smtpEmail = this.config.get<string>('SMTP_EMAIL')!;
    const transporter = this.transporter();
    const appUrl = this.config.get<string>('APP_URL');
    const inbound = renderAdminContact(data, appUrl);
    const receipt = renderContactReceipt(data, appUrl);

    await transporter.sendMail({
      from: `"Upsolve.it Support" <${smtpEmail}>`,
      to: smtpEmail,
      replyTo: headerSafe(data.email),
      subject: `[Support] ${headerSafe(data.subject)}`,
      ...inbound,
    });

    await transporter.sendMail({
      from: `"Upsolve.it Support" <${smtpEmail}>`,
      to: data.email,
      subject: 'We received your message — Upsolve.it',
      ...receipt,
    });

    const notifyEmail = this.config.get<string>('NOTIFICATION_EMAIL');
    if (notifyEmail && notifyEmail !== smtpEmail) {
      await transporter.sendMail({
        from: `"Upsolve.it Support" <${smtpEmail}>`,
        to: notifyEmail,
        replyTo: headerSafe(data.email),
        subject: `[Support] New message from ${headerSafe(data.name)}`,
        ...inbound,
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

  /**
   * Unread-support summary that backs the admin header notification bell.
   * Returns the total unread count plus the most recent unread messages so the
   * dropdown can show real, actionable items instead of a static dot.
   */
  async unreadSummary(limit = 5) {
    const [count, items] = await Promise.all([
      this.contactModel.countDocuments({ read: false }),
      this.contactModel
        .find({ read: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('name email subject category createdAt')
        .lean(),
    ]);
    return { count, items };
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

    const delivery = await transporter.sendMail({
      from: `"Upsolve.it Support" <${smtpEmail}>`,
      to: msg.email,
      subject: `Re: ${headerSafe(msg.subject)}`,
      ...renderSupportReply(msg, replyBody, this.config.get<string>('APP_URL')),
    });

    const reply: ContactReply = {
      message: replyBody,
      sentAt: new Date(),
      from: smtpEmail,
      to: msg.email,
      messageId: delivery.messageId,
    };

    try {
      const saved = await this.contactModel
        .findByIdAndUpdate(id, { $push: { replies: reply } }, { new: true })
        .lean();
      if (!saved) throw new Error('Message was removed while sending');
    } catch {
      throw new ServiceUnavailableException(
        'Your reply was emailed, but its history could not be saved. Do not resend the reply.',
      );
    }

    return { success: true, reply };
  }

  async deleteMessage(id: string) {
    return this.contactModel.findByIdAndDelete(id).lean();
  }
}
