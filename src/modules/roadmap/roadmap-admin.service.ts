import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RoadmapLevel,
  RoadmapLevelDocument,
} from './schemas/roadmap-level.schema';
import {
  RoadmapTopic,
  RoadmapTopicDocument,
} from './schemas/roadmap-topic.schema';
import {
  RoadmapResource,
  RoadmapResourceDocument,
} from './schemas/roadmap-resource.schema';
import {
  RoadmapProblem,
  RoadmapProblemDocument,
} from './schemas/roadmap-problem.schema';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export type RoadmapAdminAudit = {
  adminId: string;
  adminHandle: string;
};

@Injectable()
export class RoadmapAdminService {
  constructor(
    @InjectModel(RoadmapLevel.name)
    private readonly levelModel: Model<RoadmapLevelDocument>,
    @InjectModel(RoadmapTopic.name)
    private readonly topicModel: Model<RoadmapTopicDocument>,
    @InjectModel(RoadmapResource.name)
    private readonly resourceModel: Model<RoadmapResourceDocument>,
    @InjectModel(RoadmapProblem.name)
    private readonly problemModel: Model<RoadmapProblemDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`${label} not found`);
    }
    return new Types.ObjectId(id);
  }

  private async getMaxOrderIndex(
    model: Model<any>,
    filter: Record<string, unknown>,
  ): Promise<number> {
    const last = await model
      .find(filter)
      .sort({ orderIndex: -1 })
      .select('orderIndex')
      .limit(1)
      .lean();
    return last[0]?.orderIndex ?? -1; // -1 so first item can be index 0
  }

  private async insertAt(
    model: Model<any>,
    filter: Record<string, unknown>,
    desired?: number,
  ): Promise<number> {
    const maxIndex = await this.getMaxOrderIndex(model, filter);
    if (desired == null) return maxIndex + 1;
    const normalized = Math.max(0, Math.min(desired, maxIndex + 1));
    await model.updateMany(
      { ...filter, orderIndex: { $gte: normalized } },
      { $inc: { orderIndex: 1 } },
    );
    return normalized;
  }

  private async reorderLevel(
    doc: RoadmapLevelDocument,
    desired: number,
  ): Promise<RoadmapLevelDocument> {
    const current = doc.orderIndex;
    const maxIndex = await this.getMaxOrderIndex(this.levelModel, {});
    const next = Math.max(0, Math.min(desired, maxIndex));
    if (next === current) return doc;
    if (next < current) {
      await this.levelModel.updateMany(
        { orderIndex: { $gte: next, $lt: current } },
        { $inc: { orderIndex: 1 } },
      );
    } else {
      await this.levelModel.updateMany(
        { orderIndex: { $gt: current, $lte: next } },
        { $inc: { orderIndex: -1 } },
      );
    }
    doc.orderIndex = next;
    await doc.save();
    return doc;
  }

  private async reorderTopic(
    doc: RoadmapTopicDocument,
    desired: number,
  ): Promise<RoadmapTopicDocument> {
    const current = doc.orderIndex;
    const filter = { levelId: doc.levelId };
    const maxIndex = await this.getMaxOrderIndex(this.topicModel, filter);
    const next = Math.max(0, Math.min(desired, maxIndex));
    if (next === current) return doc;
    if (next < current) {
      await this.topicModel.updateMany(
        { ...filter, orderIndex: { $gte: next, $lt: current } },
        { $inc: { orderIndex: 1 } },
      );
    } else {
      await this.topicModel.updateMany(
        { ...filter, orderIndex: { $gt: current, $lte: next } },
        { $inc: { orderIndex: -1 } },
      );
    }
    doc.orderIndex = next;
    await doc.save();
    return doc;
  }

  private async reorderResource(
    doc: RoadmapResourceDocument,
    desired: number,
  ): Promise<RoadmapResourceDocument> {
    const current = doc.orderIndex;
    const filter = { topicId: doc.topicId, language: doc.language };
    const maxIndex = await this.getMaxOrderIndex(this.resourceModel, filter);
    const next = Math.max(0, Math.min(desired, maxIndex));
    if (next === current) return doc;
    if (next < current) {
      await this.resourceModel.updateMany(
        { ...filter, orderIndex: { $gte: next, $lt: current } },
        { $inc: { orderIndex: 1 } },
      );
    } else {
      await this.resourceModel.updateMany(
        { ...filter, orderIndex: { $gt: current, $lte: next } },
        { $inc: { orderIndex: -1 } },
      );
    }
    doc.orderIndex = next;
    await doc.save();
    return doc;
  }

  private async reorderProblem(
    doc: RoadmapProblemDocument,
    desired: number,
  ): Promise<RoadmapProblemDocument> {
    const current = doc.orderIndex;
    const filter = { topicId: doc.topicId };
    const maxIndex = await this.getMaxOrderIndex(this.problemModel, filter);
    const next = Math.max(0, Math.min(desired, maxIndex));
    if (next === current) return doc;
    if (next < current) {
      await this.problemModel.updateMany(
        { ...filter, orderIndex: { $gte: next, $lt: current } },
        { $inc: { orderIndex: 1 } },
      );
    } else {
      await this.problemModel.updateMany(
        { ...filter, orderIndex: { $gt: current, $lte: next } },
        { $inc: { orderIndex: -1 } },
      );
    }
    doc.orderIndex = next;
    await doc.save();
    return doc;
  }

  private parseCfProblemId(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';

    if (trimmed.toLowerCase().startsWith('http')) {
      const parts = trimmed.split('/').filter(Boolean);
      const contestIdx = parts.findIndex((p) => p.toLowerCase() === 'contest');
      const problemIdx = parts.findIndex((p) => p.toLowerCase() === 'problem');
      const gymIdx = parts.findIndex((p) => p.toLowerCase() === 'gym');

      if (contestIdx !== -1 && problemIdx !== -1 && problemIdx > contestIdx) {
        const contestId = parts[contestIdx + 1];
        const index = parts[problemIdx + 1];
        if (contestId && index) {
          return `${contestId}_${index.toUpperCase()}`;
        }
      }

      if (gymIdx !== -1 && problemIdx !== -1 && problemIdx > gymIdx) {
        const contestId = parts[gymIdx + 1];
        const index = parts[problemIdx + 1];
        if (contestId && index) {
          return `${contestId}_${index.toUpperCase()}`;
        }
      }

      const problemsetIdx = parts.findIndex(
        (p) => p.toLowerCase() === 'problemset',
      );
      const problemsetProblemIdx = parts.findIndex(
        (p) => p.toLowerCase() === 'problem',
      );
      if (
        problemsetIdx !== -1 &&
        problemsetProblemIdx !== -1 &&
        problemsetProblemIdx > problemsetIdx
      ) {
        const contestId =
          problemsetProblemIdx + 1 < parts.length
            ? parts[problemsetProblemIdx + 1]
            : '';
        const index =
          problemsetProblemIdx + 2 < parts.length
            ? parts[problemsetProblemIdx + 2]
            : '';
        if (contestId && index) {
          return `${contestId}_${index.toUpperCase()}`;
        }
      }
    }

    const match = trimmed.match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/);
    if (match) {
      return `${match[1]}_${match[2].toUpperCase()}`;
    }

    if (trimmed.includes('/')) {
      const parts = trimmed.split('/').filter(Boolean);
      if (parts[0] === 'gym' && parts[1] && parts[2]) {
        return `${parts[1]}_${parts[2].toUpperCase()}`;
      }
      if (parts[0] && parts[1]) {
        return `${parts[0]}_${parts[1].toUpperCase()}`;
      }
    }

    return trimmed;
  }

  // === LEVEL MANAGEMENT ===

  async listLevels() {
    const levels = await this.levelModel.find().sort({ orderIndex: 1 }).lean();

    const counts = await this.topicModel.aggregate([
      { $group: { _id: '$levelId', count: { $sum: 1 } } },
    ]);
    const byLevel = new Map(
      counts.map((c) => [String(c._id), Number(c.count)]),
    );

    return levels.map((l) => ({
      ...l,
      topicsCount: byLevel.get(String(l._id)) ?? 0,
    }));
  }

  async createLevel(dto: CreateLevelDto, audit?: RoadmapAdminAudit) {
    const orderIndex = await this.insertAt(this.levelModel, {}, dto.orderIndex);
    const doc = await this.levelModel.create({
      ...dto,
      orderIndex,
    });
    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_LEVEL',
        'RoadmapLevel',
        audit.adminId,
        audit.adminHandle,
        { levelId: String(doc._id) },
        doc._id,
      );
    }
    return doc;
  }

  async updateLevel(
    levelId: string,
    dto: UpdateLevelDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(levelId, 'Level');
    let doc: any = await this.levelModel.findById(id);
    if (!doc) throw new NotFoundException('Level not found');

    if (dto.orderIndex != null && dto.orderIndex !== doc.orderIndex) {
      doc = await this.reorderLevel(doc, dto.orderIndex);
    }

    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.description !== undefined) doc.description = dto.description;
    if (dto.isPublished !== undefined)
      doc.isPublished = doc.isPublished = dto.isPublished;
    if (dto.visibility !== undefined) doc.visibility = dto.visibility;
    if (dto.allowedUserIds !== undefined) {
      doc.allowedUserIds = dto.allowedUserIds.map(
        (uid) => new Types.ObjectId(uid),
      );
    }
    if (dto.levelBonusXp !== undefined) doc.levelBonusXp = dto.levelBonusXp;

    await doc.save();

    if (audit) {
      await this.auditLogs.logAction(
        'UPDATE_ROADMAP_LEVEL',
        'RoadmapLevel',
        audit.adminId,
        audit.adminHandle,
        { levelId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async deleteLevel(levelId: string, audit?: RoadmapAdminAudit) {
    const id = this.toObjectId(levelId, 'Level');
    const doc = await this.levelModel.findById(id);
    if (!doc) throw new NotFoundException('Level not found');

    const topics = await this.topicModel
      .find({ levelId: id })
      .select('_id')
      .lean();
    const topicIds = topics.map((t) => t._id);

    if (topicIds.length) {
      await this.problemModel.deleteMany({ topicId: { $in: topicIds } });
      await this.resourceModel.deleteMany({ topicId: { $in: topicIds } });
      await this.topicModel.deleteMany({ levelId: id });
    }

    await this.levelModel.deleteOne({ _id: id });

    await this.levelModel.updateMany(
      { orderIndex: { $gt: doc.orderIndex } },
      { $inc: { orderIndex: -1 } },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_LEVEL',
        'RoadmapLevel',
        audit.adminId,
        audit.adminHandle,
        { levelId: String(id) },
        id,
      );
    }

    return { ok: true };
  }

  // === GRANT / REVOKE ACCESS ===

  async grantLevelAccess(
    levelId: string,
    userIds: string[],
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(levelId, 'Level');
    const level = await this.levelModel.findById(id);
    if (!level) throw new NotFoundException('Level not found');

    const oids = userIds.map((uid) => new Types.ObjectId(uid));
    for (const oid of oids) {
      if (!level.allowedUserIds?.some((existing) => existing.equals(oid))) {
        level.allowedUserIds.push(oid);
      }
    }
    level.visibility = 'specific_users';
    await level.save();

    if (audit) {
      await this.auditLogs.logAction(
        'GRANT_LEVEL_ACCESS',
        'RoadmapLevel',
        audit.adminId,
        audit.adminHandle,
        { levelId: String(level._id), grantedUserIds: userIds },
        level._id,
      );
    }

    return level;
  }

  async revokeLevelAccess(
    levelId: string,
    userIds: string[],
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(levelId, 'Level');
    const level = await this.levelModel.findById(id);
    if (!level) throw new NotFoundException('Level not found');

    const revokeSet = new Set(userIds.map((uid) => String(uid)));
    level.allowedUserIds =
      level.allowedUserIds?.filter(
        (existing) => !revokeSet.has(String(existing)),
      ) ?? [];

    await level.save();

    if (audit) {
      await this.auditLogs.logAction(
        'REVOKE_LEVEL_ACCESS',
        'RoadmapLevel',
        audit.adminId,
        audit.adminHandle,
        { levelId: String(level._id), revokedUserIds: userIds },
        level._id,
      );
    }

    return level;
  }

  // === TOPIC MANAGEMENT ===

  async listTopics(levelId: string) {
    const id = this.toObjectId(levelId, 'Level');
    const topics = await this.topicModel
      .find({ levelId: id })
      .sort({ orderIndex: 1 })
      .lean();

    const topicIds = topics.map((t) => t._id);

    // Count resources and problems for each topic
    const resources = topicIds.length
      ? await this.resourceModel.aggregate([
          { $match: { topicId: { $in: topicIds } } },
          { $group: { _id: '$topicId', count: { $sum: 1 } } },
        ])
      : [];
    const problems = topicIds.length
      ? await this.problemModel.aggregate([
          { $match: { topicId: { $in: topicIds } } },
          { $group: { _id: '$topicId', count: { $sum: 1 } } },
        ])
      : [];

    const resourceMap = new Map(
      resources.map((r) => [String(r._id), Number(r.count)]),
    );
    const problemMap = new Map(
      problems.map((p) => [String(p._id), Number(p.count)]),
    );

    return topics.map((t) => ({
      ...t,
      resourcesCount: resourceMap.get(String(t._id)) ?? 0,
      problemsCount: problemMap.get(String(t._id)) ?? 0,
    }));
  }

  async createTopic(
    levelId: string,
    dto: CreateTopicDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(levelId, 'Level');
    const orderIndex = await this.insertAt(
      this.topicModel,
      { levelId: id },
      dto.orderIndex,
    );
    const doc = await this.topicModel.create({
      ...dto,
      levelId: id,
      orderIndex,
      subtopics: dto.subtopics ?? [],
    });
    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_TOPIC',
        'RoadmapTopic',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(doc._id), levelId: String(id) },
        doc._id,
      );
    }
    return doc;
  }

  async updateTopic(
    topicId: string,
    dto: UpdateTopicDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    let doc: any = await this.topicModel.findById(id);
    if (!doc) throw new NotFoundException('Topic not found');

    if (dto.orderIndex != null && dto.orderIndex !== doc.orderIndex) {
      doc = await this.reorderTopic(doc, dto.orderIndex);
    }

    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.description !== undefined) doc.description = dto.description;
    if (dto.subtopics !== undefined) doc.subtopics = dto.subtopics;
    if (dto.requiredLearningPct !== undefined)
      doc.requiredLearningPct = dto.requiredLearningPct;
    if (dto.requiredProblemPct !== undefined)
      doc.requiredProblemPct = dto.requiredProblemPct;
    if (dto.topicXpReward !== undefined) doc.topicXpReward = dto.topicXpReward;
    if (dto.groupLinks !== undefined) doc.groupLinks = dto.groupLinks;
    if (dto.groupNote !== undefined) doc.groupNote = dto.groupNote;

    await doc.save();

    if (audit) {
      await this.auditLogs.logAction(
        'UPDATE_ROADMAP_TOPIC',
        'RoadmapTopic',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async reorderTopicOnly(topicId: string, orderIndex: number) {
    const id = this.toObjectId(topicId, 'Topic');
    const doc = await this.topicModel.findById(id);
    if (!doc) throw new NotFoundException('Topic not found');
    return await this.reorderTopic(doc, orderIndex);
  }

  async deleteTopic(topicId: string, audit?: RoadmapAdminAudit) {
    const id = this.toObjectId(topicId, 'Topic');
    const doc = await this.topicModel.findById(id);
    if (!doc) throw new NotFoundException('Topic not found');

    await this.problemModel.deleteMany({ topicId: id });
    await this.resourceModel.deleteMany({ topicId: id });
    await this.topicModel.deleteOne({ _id: id });

    await this.topicModel.updateMany(
      { levelId: doc.levelId, orderIndex: { $gt: doc.orderIndex } },
      { $inc: { orderIndex: -1 } },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_TOPIC',
        'RoadmapTopic',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(id) },
        id,
      );
    }

    return { ok: true };
  }

  // === RESOURCE MANAGEMENT ===

  async listResources(topicId: string) {
    const id = this.toObjectId(topicId, 'Topic');
    return await this.resourceModel
      .find({ topicId: id })
      .sort({ orderIndex: 1 })
      .lean();
  }

  async addResource(
    topicId: string,
    dto: CreateResourceDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(id);
    if (!topic) throw new NotFoundException('Topic not found');

    const orderIndex = await this.insertAt(
      this.resourceModel,
      { topicId: id, language: dto.language },
      dto.orderIndex,
    );

    const doc = await this.resourceModel.create({
      ...dto,
      topicId: id,
      orderIndex,
    });

    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_RESOURCE',
        'RoadmapResource',
        audit.adminId,
        audit.adminHandle,
        { resourceId: String(doc._id), topicId: String(id) },
        doc._id,
      );
    }

    return doc;
  }

  async updateResource(
    resourceId: string,
    dto: UpdateResourceDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(resourceId, 'Resource');
    let doc: any = await this.resourceModel.findById(id);
    if (!doc) throw new NotFoundException('Resource not found');

    if (dto.orderIndex != null && dto.orderIndex !== doc.orderIndex) {
      doc = await this.reorderResource(doc, dto.orderIndex);
    }

    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.description !== undefined) doc.description = dto.description || '';
    if (dto.language !== undefined) doc.language = dto.language;
    if (dto.type !== undefined) doc.type = dto.type;
    if (dto.url !== undefined) doc.url = dto.url;
    if (dto.weight !== undefined) doc.weight = dto.weight;
    if (dto.xpReward !== undefined) doc.xpReward = dto.xpReward;
    if (dto.videoCompletionThresholdPct !== undefined)
      doc.videoCompletionThresholdPct = dto.videoCompletionThresholdPct;

    await doc.save();

    if (audit) {
      await this.auditLogs.logAction(
        'UPDATE_ROADMAP_RESOURCE',
        'RoadmapResource',
        audit.adminId,
        audit.adminHandle,
        { resourceId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async deleteResource(resourceId: string, audit?: RoadmapAdminAudit) {
    const id = this.toObjectId(resourceId, 'Resource');
    const doc = await this.resourceModel.findById(id);
    if (!doc) throw new NotFoundException('Resource not found');

    await this.resourceModel.deleteOne({ _id: id });
    await this.resourceModel.updateMany(
      {
        topicId: doc.topicId,
        language: doc.language,
        orderIndex: { $gt: doc.orderIndex },
      },
      { $inc: { orderIndex: -1 } },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_RESOURCE',
        'RoadmapResource',
        audit.adminId,
        audit.adminHandle,
        { resourceId: String(id) },
        id,
      );
    }

    return { ok: true };
  }

  async reorderResourceOnly(resourceId: string, orderIndex: number) {
    const id = this.toObjectId(resourceId, 'Resource');
    const doc = await this.resourceModel.findById(id);
    if (!doc) throw new NotFoundException('Resource not found');
    return await this.reorderResource(doc, orderIndex);
  }

  // === PROBLEM MANAGEMENT ===

  async listProblems(topicId: string) {
    const id = this.toObjectId(topicId, 'Topic');
    return await this.problemModel
      .find({ topicId: id })
      .sort({ orderIndex: 1 })
      .lean();
  }

  async addProblem(
    topicId: string,
    dto: CreateProblemDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(id);
    if (!topic) throw new NotFoundException('Topic not found');

    const cfProblemId = this.parseCfProblemId(dto.url);
    const exists = await this.problemModel.findOne({
      topicId: id,
      cfProblemId,
    });
    if (exists && cfProblemId) {
      throw new BadRequestException('Problem already exists in this topic');
    }

    const orderIndex = await this.insertAt(
      this.problemModel,
      { topicId: id },
      dto.orderIndex,
    );

    const doc = await this.problemModel.create({
      ...dto,
      topicId: id,
      orderIndex,
      cfProblemId,
    });

    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { problemId: String(doc._id), topicId: String(id) },
        doc._id,
      );
    }

    return doc;
  }

  async addProblems(
    topicId: string,
    dtos: Array<{ name: string; url: string; xpReward?: number }>,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(id);
    if (!topic) throw new NotFoundException('Topic not found');

    const existing = await this.problemModel
      .find({ topicId: id })
      .select('cfProblemId')
      .lean();
    const existingIds = new Set(
      existing.map((p) => p.cfProblemId).filter(Boolean),
    );

    const maxIndex = await this.getMaxOrderIndex(this.problemModel, {
      topicId: id,
    });

    const docs: Array<{
      topicId: Types.ObjectId;
      name: string;
      url: string;
      cfProblemId: string;
      orderIndex: number;
      xpReward: number;
    }> = [];

    let orderIndex = maxIndex;
    for (const dto of dtos) {
      const cfProblemId = this.parseCfProblemId(dto.url);
      if (cfProblemId && existingIds.has(cfProblemId)) continue;
      orderIndex++;
      docs.push({
        topicId: id,
        name: dto.name,
        url: dto.url,
        cfProblemId,
        orderIndex,
        xpReward: dto.xpReward ?? 40,
      });
    }

    if (docs.length === 0) {
      return { ok: true, inserted: 0, skipped: dtos.length };
    }

    const inserted = await this.problemModel.insertMany(docs);

    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(id), count: inserted.length },
      );
    }

    return {
      ok: true,
      inserted: inserted.length,
      skipped: dtos.length - inserted.length,
    };
  }

  async updateProblem(
    problemId: string,
    dto: UpdateProblemDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(problemId, 'Problem');
    let doc: any = await this.problemModel.findById(id);
    if (!doc) throw new NotFoundException('Problem not found');

    if (dto.orderIndex != null && dto.orderIndex !== doc.orderIndex) {
      doc = await this.reorderProblem(doc, dto.orderIndex);
    }

    if (dto.name !== undefined) doc.name = dto.name;
    if (dto.url !== undefined) {
      doc.url = dto.url;
      doc.cfProblemId = this.parseCfProblemId(dto.url);
    }
    if (dto.xpReward !== undefined) doc.xpReward = dto.xpReward;

    await doc.save();

    if (audit) {
      await this.auditLogs.logAction(
        'UPDATE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { problemId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async reorderProblemOnly(problemId: string, orderIndex: number) {
    const id = this.toObjectId(problemId, 'Problem');
    const doc = await this.problemModel.findById(id);
    if (!doc) throw new NotFoundException('Problem not found');
    return await this.reorderProblem(doc, orderIndex);
  }

  async deleteProblem(problemId: string, audit?: RoadmapAdminAudit) {
    const id = this.toObjectId(problemId, 'Problem');
    const doc = await this.problemModel.findById(id);
    if (!doc) throw new NotFoundException('Problem not found');

    await this.problemModel.deleteOne({ _id: id });
    await this.problemModel.updateMany(
      { topicId: doc.topicId, orderIndex: { $gt: doc.orderIndex } },
      { $inc: { orderIndex: -1 } },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { problemId: String(id) },
        id,
      );
    }

    return { ok: true };
  }

  async deleteProblems(problemIds: string[], audit?: RoadmapAdminAudit) {
    const ids = problemIds.map((id) => this.toObjectId(id, 'Problem'));
    const docs = await this.problemModel.find({ _id: { $in: ids } });
    if (!docs.length) throw new NotFoundException('No problems found');

    await this.problemModel.deleteMany({ _id: { $in: ids } });

    for (const doc of docs) {
      await this.problemModel.updateMany(
        { topicId: doc.topicId, orderIndex: { $gt: doc.orderIndex } },
        { $inc: { orderIndex: -1 } },
      );
    }

    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { problemIds: ids.map(String) },
      );
    }

    return { ok: true, deleted: docs.length };
  }
}
