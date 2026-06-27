import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  WhatsNewService,
  type CreateWhatsNewDto,
  type UpdateWhatsNewDto,
} from './whats-new.service';

@Controller('whats-new')
export class WhatsNewController {
  constructor(private readonly whatsNew: WhatsNewService) {}

  /* ───── Public ───── */

  /** Published entries visible to all users. */
  @Get()
  async listPublished() {
    return this.whatsNew.findPublished();
  }

  /* ───── Admin-protected ───── */

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin')
  async listAll() {
    return this.whatsNew.findAll();
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('admin')
  async create(@Body() body?: CreateWhatsNewDto) {
    if (!body?.title || !body?.content) {
      throw new BadRequestException('Title and content are required');
    }
    return this.whatsNew.create(body);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/:id')
  async update(@Param('id') id: string, @Body() body?: UpdateWhatsNewDto) {
    return this.whatsNew.update(id, body ?? {});
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('admin/:id')
  async remove(@Param('id') id: string) {
    return this.whatsNew.delete(id);
  }
}
