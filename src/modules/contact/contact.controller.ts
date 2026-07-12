import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { SendContactDto } from './dto/send-contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  async send(@Body() body: SendContactDto) {
    await this.contact.sendContactEmail({
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
      category: body.category ?? 'general',
    });
    return {
      message:
        'Email sent successfully! You will receive a confirmation email shortly.',
      success: true,
    };
  }
}
