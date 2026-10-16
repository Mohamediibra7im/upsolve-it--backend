import { ConfigService } from '@nestjs/config';
import { Model, Types, model } from 'mongoose';
import nodemailer from 'nodemailer';
import { ContactService } from './contact.service';
import {
  ContactMessageDocument,
  ContactMessageSchema,
} from './schemas/contact-message.schema';

const MessageModel = model('ContactReplyHistoryTest', ContactMessageSchema);
const id = '507f1f77bcf86cd799439011';

describe('ContactService reply history', () => {
  let service: ContactService;
  let stored: Record<string, any>;
  let sendMail: jest.Mock;
  let update: jest.Mock;

  beforeEach(() => {
    stored = {
      _id: new Types.ObjectId(id),
      name: 'Support reader',
      email: 'reader@example.com',
      subject: 'Website issue',
      message: 'I cannot open the other tabs.',
    };
    sendMail = jest.fn().mockResolvedValue({
      messageId: '<first-reply@example.com>',
      accepted: ['reader@example.com'],
      rejected: [],
    });
    jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    update = jest.fn((_id: string, changes: any) => {
      const replies = [...(stored.replies ?? []), changes.$push.replies];
      stored = new MessageModel({ ...stored, replies }).toObject();
      return { lean: () => Promise.resolve(stored) };
    });
    const contactModel = {
      findById: () => ({ lean: () => Promise.resolve(stored) }),
      findByIdAndUpdate: update,
    } as unknown as Model<ContactMessageDocument>;
    service = new ContactService(
      new ConfigService({
        SMTP_EMAIL: 'support@example.com',
        SMTP_PASSWORD: 'test-password',
      }),
      contactModel,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps each emailed reply with its text, addresses, and send time', async () => {
    const before = Date.now();
    await service.sendReply(id, 'The tabs now work.\nPlease try again.');
    sendMail.mockResolvedValueOnce({
      messageId: '<second-reply@example.com>',
      accepted: ['reader@example.com'],
      rejected: [],
    });
    const result = await service.sendReply(id, 'Let us know if you need help.');

    expect(stored.replies).toHaveLength(2);
    expect(stored.replies[0]).toMatchObject({
      message: 'The tabs now work.\nPlease try again.',
      from: 'support@example.com',
      to: 'reader@example.com',
      messageId: '<first-reply@example.com>',
    });
    expect(stored.replies[0].sentAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.replies[0].sentAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(stored.replies[1].message).toBe('Let us know if you need help.');
    expect(result).toMatchObject({
      success: true,
      reply: { messageId: '<second-reply@example.com>' },
    });
  });

  it('does not add a sent reply when email delivery fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(service.sendReply(id, 'Please try again.')).rejects.toThrow(
      'SMTP unavailable',
    );
    expect(stored.replies ?? []).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it('warns that the email was sent when saving its history fails', async () => {
    update.mockImplementationOnce(() => {
      throw new Error('Database unavailable');
    });

    await expect(service.sendReply(id, 'Please try again.')).rejects.toThrow(
      /emailed.*history.*not.*saved/i,
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('gives older contact messages an empty reply history', () => {
    expect(new MessageModel(stored).toObject()).toMatchObject({ replies: [] });
  });
});
