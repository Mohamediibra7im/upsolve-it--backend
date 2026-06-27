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
  SuggestionsService,
  type CreateSuggestionDto,
  type UpdateSuggestionDto,
} from './suggestions.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  /* ---- Public ---- */

  @Get()
  async listActive() {
    return this.suggestions.findActive();
  }

  /* ---- Admin-protected ---- */

  @UseGuards(AuthGuard, AdminGuard)
  @Get('admin')
  async listAll() {
    return this.suggestions.findAll();
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('admin')
  async create(@Body() body?: CreateSuggestionDto) {
    if (!body?.title || !body?.url) {
      throw new BadRequestException('Title and URL are required');
    }
    return this.suggestions.create(body);
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('admin/:id')
  async update(@Param('id') id: string, @Body() body?: UpdateSuggestionDto) {
    return this.suggestions.update(id, body ?? {});
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('admin/:id')
  async remove(@Param('id') id: string) {
    return this.suggestions.delete(id);
  }
}
