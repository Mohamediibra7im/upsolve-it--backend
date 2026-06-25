import {
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
import { AdminService } from '../admin/admin.service';
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
    private readonly admin: AdminService,
    private readonly roadmap: RoadmapAdminService,
    private readonly progress: RoadmapProgressService,
  ) {}

  // === LEVELS ===

  @Get('levels')
  async listLevels(
    @Headers('authorization') authorization?: string,
    @Req() req?: any,
  ) {
    await this.admin.requireAdmin(authorization, req?.cookies?.accessToken);
    const levels = await this.roadmap.listLevels();
    return { levels };
  }

  @Post('levels')
  async createLevel(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateLevelDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const level = await this.roadmap.createLevel(body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @Patch('levels/:id')
  async updateLevel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateLevelDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const level = await this.roadmap.updateLevel(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @Delete('levels/:id')
  async deleteLevel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.deleteLevel(id, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === GRANT / REVOKE ACCESS ===

  @Post('levels/:id/grant')
  async grantLevelAccess(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: GrantLevelAccessDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const level = await this.roadmap.grantLevelAccess(id, body.userIds, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  @Post('levels/:id/revoke')
  async revokeLevelAccess(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: GrantLevelAccessDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const level = await this.roadmap.revokeLevelAccess(id, body.userIds, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { level };
  }

  // === TOPICS ===

  @Get('levels/:id/topics')
  async listTopics(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const topics = await this.roadmap.listTopics(id);
    return { topics };
  }

  @Post('levels/:id/topics')
  async createTopic(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: CreateTopicDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const topic = await this.roadmap.createTopic(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { topic };
  }

  @Patch('topics/:id')
  async updateTopic(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateTopicDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const topic = await this.roadmap.updateTopic(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { topic };
  }

  @Patch('topics/:id/reorder')
  async reorderTopic(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ReorderDto,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const topic = await this.roadmap.reorderTopicOnly(id, body.orderIndex);
    return { topic };
  }

  @Delete('topics/:id')
  async deleteTopic(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.deleteTopic(id, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === RESOURCES ===

  @Get('topics/:id/resources')
  async listResources(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const resources = await this.roadmap.listResources(id);
    return { resources };
  }

  @Post('topics/:id/resources')
  async addResource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: CreateResourceDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const resource = await this.roadmap.addResource(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { resource };
  }

  @Patch('resources/:id')
  async updateResource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateResourceDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const resource = await this.roadmap.updateResource(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { resource };
  }

  @Patch('resources/:id/reorder')
  async reorderResource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ReorderDto,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const resource = await this.roadmap.reorderResourceOnly(
      id,
      body.orderIndex,
    );
    return { resource };
  }

  @Delete('resources/:id')
  async deleteResource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.deleteResource(id, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  // === PROBLEMS ===

  @Get('topics/:id/problems')
  async listProblems(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const problems = await this.roadmap.listProblems(id);
    return { problems };
  }

  @Post('topics/:id/problems')
  async addProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: CreateProblemDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const problem = await this.roadmap.addProblem(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { problem };
  }

  @Post('topics/:id/problems/bulk')
  async addProblems(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: BulkAddProblemsDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.addProblems(id, body.problems, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @Patch('problems/:id')
  async updateProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateProblemDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    const problem = await this.roadmap.updateProblem(id, body, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
    return { problem };
  }

  @Patch('problems/:id/reorder')
  async reorderProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ReorderDto,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    const problem = await this.roadmap.reorderProblemOnly(id, body.orderIndex);
    return { problem };
  }

  @Delete('problems/:id')
  async deleteProblem(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.deleteProblem(id, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @Delete('problems')
  async deleteProblems(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: DeleteProblemsDto,
    @Req() req: any,
  ) {
    const current = await this.admin.requireAdmin(
      authorization,
      req.cookies?.accessToken,
    );
    return await this.roadmap.deleteProblems(body.problemIds, {
      adminId: String(current._id),
      adminHandle: current.codeforcesHandle ?? 'admin',
    });
  }

  @Post('topics/:id/import')
  async importProblems(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ImportProblemsDto,
    @Req() req: any,
  ) {
    await this.admin.requireAdmin(authorization, req.cookies?.accessToken);
    return await this.progress.importProblems(id, body);
  }
}
