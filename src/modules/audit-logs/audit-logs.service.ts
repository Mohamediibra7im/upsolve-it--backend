import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogFilters {
  action?: string;
  entity?: string;
  performedBy?: string;
  performedByHandle?: string;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async logAction(
    action: string,
    entity: string,
    performedBy: Types.ObjectId | string,
    performedByHandle: string,
    details: Record<string, any> = {},
    entityId?: Types.ObjectId | string,
  ) {
    try {
      const log = new this.auditLogModel({
        action,
        entity,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        performedBy: new Types.ObjectId(performedBy),
        performedByHandle,
        details,
      });
      return await log.save();
    } catch (error) {
      this.logger.error('Failed to save audit log:', error);
      // We don't throw here to prevent breaking the main action if logging fails
    }
  }

  async logActions(
    entries: Array<{
      action: string;
      entity: string;
      performedBy: Types.ObjectId | string;
      performedByHandle: string;
      details?: Record<string, any>;
      entityId?: Types.ObjectId | string;
    }>,
  ) {
    if (!entries.length) return;
    try {
      await this.auditLogModel.insertMany(
        entries.map((e) => ({
          action: e.action,
          entity: e.entity,
          entityId: e.entityId ? new Types.ObjectId(e.entityId) : undefined,
          performedBy: new Types.ObjectId(e.performedBy),
          performedByHandle: e.performedByHandle,
          details: e.details ?? {},
        })),
        { ordered: false },
      );
    } catch (error) {
      this.logger.error('Failed to save audit logs (bulk):', error);
    }
  }

  async listLogs(limit = 100, offset = 0, filters: AuditLogFilters = {}) {
    const query: QueryFilter<AuditLogDocument> = {};

    if (filters.action) query.action = filters.action;
    if (filters.entity) query.entity = filters.entity;
    if (filters.performedBy)
      query.performedBy = new Types.ObjectId(filters.performedBy);
    if (filters.performedByHandle) {
      query.performedByHandle = {
        $regex: filters.performedByHandle,
        $options: 'i',
      };
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('performedBy', 'codeforcesHandle avatar')
        .exec(),
      this.auditLogModel.countDocuments(query),
    ]);

    return {
      logs,
      total,
      limit,
      offset,
    };
  }
}
