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
  SuggestionsService,
  type CreateSuggestionDto,
  type UpdateSuggestionDto,
} from './suggestions.service';
import { AdminService } from '../admin/admin.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(
    private readonly suggestions: SuggestionsService,
    private readonly admin: AdminService,
  ) {}

  /* ---- Public ---- */

  @Get()
  async listActive() {
    return this.suggestions.findActive();
  }

  /* ---- Admin-protected ---- */

  @Get('admin')
  async listAll(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    return this.suggestions.findAll();
  }

  @Post('admin')
  async create(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
    @Body() body?: CreateSuggestionDto,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    if (!body?.title || !body?.url) {
      throw new BadRequestException('Title and URL are required');
    }
    return this.suggestions.create(body);
  }

  @Patch('admin/:id')
  async update(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
    @Body() body?: UpdateSuggestionDto,
  ) {
    await this.admin.requireAdmin(
      authorization,
      req?.cookies?.accessToken as string | undefined,
    );
    return this.suggestions.update(id, body ?? {});
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
    return this.suggestions.delete(id);
  }
}
