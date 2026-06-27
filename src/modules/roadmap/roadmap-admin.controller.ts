import {
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { RoadmapAdminService } from './roadmap-admin.service';
import { RoadmapProgressService } from './roadmap-progress.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { GrantLevelAccessDto } from './dto/grant-level-access.dto';
import { ReorderDto } from './dto/reorder.dto';
import { ImportProblemsDto } from './dto/import-problems.dto';
import { DeleteProblemsDto } from './dto/delete-problems.dto';
import { BulkAddProblemsDto } from './dto/bulk-add-problems.dto';

@Controller('admin/roadmap')
export class RoadmapAdminController {
  constructor(
    private readonly roadmap: RoadmapAdminService,
    private readonly progress: RoadmapProgressService,
  ) {}

  // === LEVELS ===

  @UseGuards(AuthGuard, AdminGuard)
  @Get('levels')
  async listLevels() {
    const levels = await this.roadmap.listLevels();
    return { levels };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('levels')
  async createLevel(
    @Body() body: CreateLevelDto,
    @CurrentUser() current: UserDocument,
  ) {
    const level = await this.roadmap.createLevel(body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('levels/:id')
  async updateLevel(
    @Param('id') id: string,
    @Body() body: UpdateLevelDto,
    @CurrentUser() current: UserDocument,
  ) {
    const level = await this.roadmap.updateLevel(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('levels/:id')
  async deleteLevel(
    @Param('id') id: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.deleteLevel(id, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === GRANT / REVOKE ACCESS ===

  @UseGuards(AuthGuard, AdminGuard)
  @Post('levels/:id/grant')
  async grantLevelAccess(
    @Param('id') id: string,
    @Body() body: GrantLevelAccessDto,
    @CurrentUser() current: UserDocument,
  ) {
    const level = await this.roadmap.grantLevelAccess(id, body.userIds, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('levels/:id/revoke')
  async revokeLevelAccess(
    @Param('id') id: string,
    @Body() body: GrantLevelAccessDto,
    @CurrentUser() current: UserDocument,
  ) {
    const level = await this.roadmap.revokeLevelAccess(id, body.userIds, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  // === TOPICS ===

  @UseGuards(AuthGuard, AdminGuard)
  @Get('levels/:id/topics')
  async listTopics(@Param('id') id: string) {
    const topics = await this.roadmap.listTopics(id);
    return { topics };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('levels/:id/topics')
  async createTopic(
    @Param('id') id: string,
    @Body() body: CreateTopicDto,
    @CurrentUser() current: UserDocument,
  ) {
    const topic = await this.roadmap.createTopic(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { topic };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('topics/:id')
  async updateTopic(
    @Param('id') id: string,
    @Body() body: UpdateTopicDto,
    @CurrentUser() current: UserDocument,
  ) {
    const topic = await this.roadmap.updateTopic(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { topic };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('topics/:id/reorder')
  async reorderTopic(@Param('id') id: string, @Body() body: ReorderDto) {
    const topic = await this.roadmap.reorderTopicOnly(id, body.orderIndex);
    return { topic };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('topics/:id')
  async deleteTopic(
    @Param('id') id: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.deleteTopic(id, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === RESOURCES ===

  @UseGuards(AuthGuard, AdminGuard)
  @Get('topics/:id/resources')
  async listResources(@Param('id') id: string) {
    const resources = await this.roadmap.listResources(id);
    return { resources };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('topics/:id/resources')
  async addResource(
    @Param('id') id: string,
    @Body() body: CreateResourceDto,
    @CurrentUser() current: UserDocument,
  ) {
    const resource = await this.roadmap.addResource(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { resource };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('resources/:id')
  async updateResource(
    @Param('id') id: string,
    @Body() body: UpdateResourceDto,
    @CurrentUser() current: UserDocument,
  ) {
    const resource = await this.roadmap.updateResource(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { resource };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('resources/:id/reorder')
  async reorderResource(@Param('id') id: string, @Body() body: ReorderDto) {
    const resource = await this.roadmap.reorderResourceOnly(
      id,
      body.orderIndex,
    );
    return { resource };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('resources/:id')
  async deleteResource(
    @Param('id') id: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.deleteResource(id, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === PROBLEMS ===

  @UseGuards(AuthGuard, AdminGuard)
  @Get('topics/:id/problems')
  async listProblems(@Param('id') id: string) {
    const problems = await this.roadmap.listProblems(id);
    return { problems };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('topics/:id/problems')
  async addProblem(
    @Param('id') id: string,
    @Body() body: CreateProblemDto,
    @CurrentUser() current: UserDocument,
  ) {
    const problem = await this.roadmap.addProblem(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { problem };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('topics/:id/problems/bulk')
  async addProblems(
    @Param('id') id: string,
    @Body() body: BulkAddProblemsDto,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.addProblems(id, body.problems, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('problems/:id')
  async updateProblem(
    @Param('id') id: string,
    @Body() body: UpdateProblemDto,
    @CurrentUser() current: UserDocument,
  ) {
    const problem = await this.roadmap.updateProblem(id, body, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { problem };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Patch('problems/:id/reorder')
  async reorderProblem(@Param('id') id: string, @Body() body: ReorderDto) {
    const problem = await this.roadmap.reorderProblemOnly(id, body.orderIndex);
    return { problem };
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('problems/:id')
  async deleteProblem(
    @Param('id') id: string,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.deleteProblem(id, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Delete('problems')
  async deleteProblems(
    @Body() body: DeleteProblemsDto,
    @CurrentUser() current: UserDocument,
  ) {
    return await this.roadmap.deleteProblems(body.problemIds, {
      adminId: current._id.toString(),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @UseGuards(AuthGuard, AdminGuard)
  @Post('topics/:id/import')
  async importProblems(
    @Param('id') id: string,
    @Body() body: ImportProblemsDto,
  ) {
    return await this.progress.importProblems(id, body);
  }
}
