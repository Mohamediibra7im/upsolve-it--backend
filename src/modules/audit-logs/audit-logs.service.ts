import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

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

  async listLogs(limit = 100, offset = 0, filters: any = {}) {
    const query: any = {};

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
