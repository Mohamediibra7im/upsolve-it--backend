import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  WhatsNewService,
  type CreateWhatsNewDto,
  type UpdateWhatsNewDto,
} from './whats-new.service';
import { AdminService } from '../admin/admin.service';

@Controller('whats-new')
export class WhatsNewController {
  constructor(
    private readonly whatsNew: WhatsNewService,
    private readonly admin: AdminService,
  ) {}

  /* ───── Public ───── */

  /** Published entries visible to all users. */
  @Get()
  async listPublished() {
    return this.whatsNew.findPublished();
  }

  /* ───── Admin-protected ───── */

  @Get('admin')
  async listAll(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    return this.whatsNew.findAll();
  }

  @Post('admin')
  async create(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
    @Body() body?: CreateWhatsNewDto,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    if (!body?.title || !body?.content) {
      throw new BadRequestException('Title and content are required');
    }
    return this.whatsNew.create(body);
  }

  @Patch('admin/:id')
  async update(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
    @Body() body?: UpdateWhatsNewDto,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    return this.whatsNew.update(id, body ?? {});
  }

  @Delete('admin/:id')
  async remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    return this.whatsNew.delete(id);
  }
}
