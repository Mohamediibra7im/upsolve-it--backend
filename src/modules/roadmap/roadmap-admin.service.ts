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
  RoadmapVideo,
  RoadmapVideoDocument,
} from './schemas/roadmap-video.schema';
import {
  RoadmapSheet,
  RoadmapSheetDocument,
} from './schemas/roadmap-sheet.schema';
import {
  RoadmapProblem,
  RoadmapProblemDocument,
} from './schemas/roadmap-problem.schema';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { UpsertVideoDto } from './dto/upsert-video.dto';
import { UpsertSheetDto } from './dto/upsert-sheet.dto';
import { CreateProblemDto } from './dto/create-problem.dto';
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
    @InjectModel(RoadmapVideo.name)
    private readonly videoModel: Model<RoadmapVideoDocument>,
    @InjectModel(RoadmapSheet.name)
    private readonly sheetModel: Model<RoadmapSheetDocument>,
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
    return last[0]?.orderIndex ?? 0;
  }

  private async insertAt(
    model: Model<any>,
    filter: Record<string, unknown>,
    desired?: number,
  ): Promise<number> {
    const maxIndex = await this.getMaxOrderIndex(model, filter);
    if (desired == null) return maxIndex + 1;
    const normalized = Math.max(1, Math.min(desired, maxIndex + 1));
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
    const next = Math.max(1, Math.min(desired, maxIndex));
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
    const next = Math.max(1, Math.min(desired, maxIndex));
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

  private async reorderProblem(
    doc: RoadmapProblemDocument,
    desired: number,
  ): Promise<RoadmapProblemDocument> {
    const current = doc.orderIndex;
    const filter = { sheetId: doc.sheetId };
    const maxIndex = await this.getMaxOrderIndex(this.problemModel, filter);
    const next = Math.max(1, Math.min(desired, maxIndex));
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

  private async getXpPerAcceptedProblem(topicId: Types.ObjectId) {
    const topic = await this.topicModel
      .findById(topicId)
      .select('levelId')
      .lean();
    if (!topic) return 10;
    const level = await this.levelModel
      .findById(topic.levelId)
      .select('xpPerAcceptedProblem')
      .lean();
    return level?.xpPerAcceptedProblem ?? 10;
  }

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
    if (dto.isPublished !== undefined) doc.isPublished = dto.isPublished;
    if (dto.videoUnlockSheetPct !== undefined) {
      doc.videoUnlockSheetPct = dto.videoUnlockSheetPct;
    }
    if (dto.sheetUnlockTopicPct !== undefined) {
      doc.sheetUnlockTopicPct = dto.sheetUnlockTopicPct;
    }
    if (dto.levelCompletionPct !== undefined) {
      doc.levelCompletionPct = dto.levelCompletionPct;
    }
    if (dto.xpPerAcceptedProblem !== undefined) {
      doc.xpPerAcceptedProblem = dto.xpPerAcceptedProblem;
    }

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

    const sheets = topicIds.length
      ? await this.sheetModel
          .find({ topicId: { $in: topicIds } })
          .select('_id')
          .lean()
      : [];
    const sheetIds = sheets.map((s) => s._id);

    if (sheetIds.length) {
      await this.problemModel.deleteMany({ sheetId: { $in: sheetIds } });
    }
    if (topicIds.length) {
      await this.sheetModel.deleteMany({ topicId: { $in: topicIds } });
      await this.videoModel.deleteMany({ topicId: { $in: topicIds } });
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

  async listTopics(levelId: string) {
    const id = this.toObjectId(levelId, 'Level');
    const topics = await this.topicModel
      .find({ levelId: id })
      .sort({ orderIndex: 1 })
      .lean();

    const topicIds = topics.map((t) => t._id);
    const videos = topicIds.length
      ? await this.videoModel
          .find({ topicId: { $in: topicIds } })
          .select('topicId')
          .lean()
      : [];
    const sheets = topicIds.length
      ? await this.sheetModel
          .find({ topicId: { $in: topicIds } })
          .select('_id topicId')
          .lean()
      : [];

    const videoSet = new Set(videos.map((v) => String(v.topicId)));
    const sheetMap = new Map(sheets.map((s) => [String(s.topicId), s._id]));
    const sheetIds = sheets.map((s) => s._id);

    const problemCounts = sheetIds.length
      ? await this.problemModel.aggregate([
          { $match: { sheetId: { $in: sheetIds } } },
          { $group: { _id: '$sheetId', count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(
      problemCounts.map((c) => [String(c._id), Number(c.count)]),
    );

    return topics.map((t) => ({
      ...t,
      hasVideo: videoSet.has(String(t._id)),
      hasSheet: sheetMap.has(String(t._id)),
      problemsCount: sheetMap.get(String(t._id))
        ? (countMap.get(String(sheetMap.get(String(t._id)))) ?? 0)
        : 0,
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
    if (dto.xpVideoReward !== undefined) {
      doc.xpVideoReward = dto.xpVideoReward;
    }

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

    const sheet = await this.sheetModel.findOne({ topicId: id }).select('_id');
    if (sheet) {
      await this.problemModel.deleteMany({ sheetId: sheet._id });
      await this.sheetModel.deleteOne({ _id: sheet._id });
    }
    await this.videoModel.deleteOne({ topicId: id });
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

  async upsertVideo(
    topicId: string,
    dto: UpsertVideoDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(id);
    if (!topic) throw new NotFoundException('Topic not found');

    const update: Record<string, unknown> = {
      youtubeUrl: dto.youtubeUrl,
    };
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.durationSec !== undefined) update.durationSec = dto.durationSec;

    const doc = await this.videoModel.findOneAndUpdate(
      { topicId: id },
      { $set: update, $setOnInsert: { topicId: id } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'UPSERT_ROADMAP_VIDEO',
        'RoadmapVideo',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(id), videoId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async deleteVideo(topicId: string, audit?: RoadmapAdminAudit) {
    const id = this.toObjectId(topicId, 'Topic');
    await this.videoModel.deleteOne({ topicId: id });
    if (audit) {
      await this.auditLogs.logAction(
        'DELETE_ROADMAP_VIDEO',
        'RoadmapVideo',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(id) },
      );
    }
    return { ok: true };
  }

  async upsertSheet(
    topicId: string,
    dto: UpsertSheetDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(topicId, 'Topic');
    const topic = await this.topicModel.findById(id);
    if (!topic) throw new NotFoundException('Topic not found');

    const update: Record<string, unknown> = {
      cfGroupUrl: dto.cfGroupUrl,
    };
    if (dto.title !== undefined) update.title = dto.title;
    if (dto.groupNote !== undefined) update.groupNote = dto.groupNote;

    const doc = await this.sheetModel.findOneAndUpdate(
      { topicId: id },
      { $set: update, $setOnInsert: { topicId: id } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    if (audit) {
      await this.auditLogs.logAction(
        'UPSERT_ROADMAP_SHEET',
        'RoadmapSheet',
        audit.adminId,
        audit.adminHandle,
        { topicId: String(id), sheetId: String(doc._id) },
        doc._id,
      );
    }

    return doc;
  }

  async addProblem(
    sheetId: string,
    dto: CreateProblemDto,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(sheetId, 'Sheet');
    const sheet = await this.sheetModel.findById(id);
    if (!sheet) throw new NotFoundException('Sheet not found');

    const exists = await this.problemModel.findOne({
      sheetId: id,
      cfProblemId: dto.cfProblemId,
    });
    if (exists) {
      throw new BadRequestException('Problem already exists in this sheet');
    }

    const orderIndex = await this.insertAt(
      this.problemModel,
      { sheetId: id },
      dto.orderIndex,
    );

    const xpReward =
      dto.xpReward ?? (await this.getXpPerAcceptedProblem(sheet.topicId)) ?? 10;

    const doc = await this.problemModel.create({
      ...dto,
      sheetId: id,
      orderIndex,
      title: dto.title ?? '',
      difficulty: dto.difficulty ?? '',
      xpReward,
    });

    if (audit) {
      await this.auditLogs.logAction(
        'CREATE_ROADMAP_PROBLEM',
        'RoadmapProblem',
        audit.adminId,
        audit.adminHandle,
        { problemId: String(doc._id), sheetId: String(id) },
        doc._id,
      );
    }

    return doc;
  }

  async addProblems(
    sheetId: string,
    dtos: Array<{ cfProblemId: string; title?: string; xpReward?: number }>,
    audit?: RoadmapAdminAudit,
  ) {
    const id = this.toObjectId(sheetId, 'Sheet');
    const sheet = await this.sheetModel.findById(id);
    if (!sheet) throw new NotFoundException('Sheet not found');

    const existing = await this.problemModel
      .find({ sheetId: id })
      .select('cfProblemId')
      .lean();
    const existingIds = new Set(existing.map((p) => p.cfProblemId));

    const maxIndex = await this.getMaxOrderIndex(this.problemModel, {
      sheetId: id,
    });

    const defaultXp =
      (await this.getXpPerAcceptedProblem(sheet.topicId)) ?? 10;

    const docs: Array<{
      sheetId: Types.ObjectId;
      cfProblemId: string;
      title: string;
      orderIndex: number;
      xpReward: number;
    }> = [];

    let orderIndex = maxIndex;
    for (const dto of dtos) {
      if (existingIds.has(dto.cfProblemId)) continue;
      orderIndex++;
      docs.push({
        sheetId: id,
        cfProblemId: dto.cfProblemId,
        title: dto.title ?? '',
        orderIndex,
        xpReward: dto.xpReward ?? defaultXp,
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
        { sheetId: String(id), count: inserted.length },
      );
    }

    return { ok: true, inserted: inserted.length, skipped: dtos.length - inserted.length };
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
      { sheetId: doc.sheetId, orderIndex: { $gt: doc.orderIndex } },
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
        { sheetId: doc.sheetId, orderIndex: { $gt: doc.orderIndex } },
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
