import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ContactService, type ContactFormData } from './contact.service';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  async send(@Body() body: ContactFormData) {
    const { name, email, subject, message, category } = body ?? ({} as any);
    if (!name || !email || !subject || !message) {
      throw new BadRequestException('All required fields must be filled');
    }
    await this.contact.sendContactEmail({
      name,
      email,
      subject,
      message,
      category: category ?? 'general',
    });
    return {
      message:
        'Email sent successfully! You will receive a confirmation email shortly.',
      success: true,
    };
  }
}
