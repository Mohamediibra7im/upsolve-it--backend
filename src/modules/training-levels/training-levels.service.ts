import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrainingLevel,
  TrainingLevelDocument,
} from './schemas/training-level.schema';
import { LevelRowDto } from './dto/replace-levels.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { getDefaultTrainingLevelDocs } from './default-training-levels.seed';

type ClientLevelRow = {
  id: number;
  level: string;
  time: string;
  Performance: string;
};

@Injectable()
export class TrainingLevelsService implements OnModuleInit {
  private readonly logger = new Logger(TrainingLevelsService.name);

  constructor(
    @InjectModel(TrainingLevel.name)
    private readonly trainingLevelModel: Model<TrainingLevelDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await this.trainingLevelModel.countDocuments().exec();
    if (count > 0) return;

    const ok = getDefaultTrainingLevelDocs();
    await this.trainingLevelModel.insertMany(ok);
    this.logger.log(`Seeded ${ok.length} default training levels.`);
  }

  /** Replace all rows with the built-in 110-level defaults (admin). */
  async reseedFromSeedFile(audit?: {
    adminId: string;
    adminHandle: string;
  }): Promise<{ count: number }> {
    const ok = getDefaultTrainingLevelDocs();
    if (ok.length === 0) {
      throw new BadRequestException('Default training levels are unavailable.');
    }

    await this.trainingLevelModel.deleteMany({}).exec();
    await this.trainingLevelModel.insertMany(ok);

    if (audit) {
      await this.auditLogs.logAction(
        'RESEED_TRAINING_LEVELS',
        'TrainingLevel',
        audit.adminId,
        audit.adminHandle,
        { count: ok.length },
      );
    }

    return { count: ok.length };
  }

  private toClientRow(
    d: TrainingLevelDocument | Record<string, unknown>,
  ): ClientLevelRow {
    const doc = d as {
      seqId: number;
      levelLabel: string;
      time: string;
      performance: number;
    };
    return {
      id: doc.seqId,
      level: doc.levelLabel,
      time: doc.time,
      Performance: String(doc.performance),
    };
  }

  async findAllForClient(): Promise<ClientLevelRow[]> {
    const rows = await this.trainingLevelModel
      .find()
      .sort({ seqId: 1 })
      .lean()
      .exec();
    return rows.map((r) => this.toClientRow(r));
  }

  async replaceAll(
    levels: LevelRowDto[],
    audit?: { adminId: string; adminHandle: string },
  ): Promise<{ count: number }> {
    const ids = new Set<number>();
    for (const row of levels) {
      if (ids.has(row.id)) {
        throw new BadRequestException(`Duplicate level id: ${row.id}`);
      }
      ids.add(row.id);
    }

    const sorted = [...levels].sort((a, b) => a.id - b.id);
    await this.trainingLevelModel.deleteMany({}).exec();

    const docs = sorted.map((r) => ({
      seqId: r.id,
      levelLabel: r.level,
      time: r.time,
      performance: r.Performance,
    }));

    await this.trainingLevelModel.insertMany(docs);

    if (audit) {
      await this.auditLogs.logAction(
        'REPLACE_TRAINING_LEVELS',
        'TrainingLevel',
        audit.adminId,
        audit.adminHandle,
        { count: docs.length },
      );
    }

    return { count: docs.length };
  }
}
