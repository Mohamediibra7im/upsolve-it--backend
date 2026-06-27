import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WhatsNewEntry,
  type WhatsNewEntryDocument,
} from './schemas/whats-new-entry.schema';

export interface CreateWhatsNewDto {
  title: string;
  content: string;
  version?: string;
  isPublished?: boolean;
}

export interface UpdateWhatsNewDto {
  title?: string;
  content?: string;
  version?: string;
  isPublished?: boolean;
}

@Injectable()
export class WhatsNewService {
  constructor(
    @InjectModel(WhatsNewEntry.name)
    private readonly entryModel: Model<WhatsNewEntryDocument>,
  ) {}

  /** Create a new changelog entry. Auto-sets publishedAt when published. */
  async create(dto: CreateWhatsNewDto) {
    const entry = await this.entryModel.create({
      title: dto.title,
      content: dto.content,
      version: dto.version ?? '',
      isPublished: dto.isPublished ?? false,
      publishedAt: dto.isPublished ? new Date() : null,
    });
    return entry;
  }

  /** Update an existing entry. Handles publishedAt transitions. */
  async update(id: string, dto: UpdateWhatsNewDto) {
    const existing = await this.entryModel.findById(id);
    if (!existing) throw new NotFoundException('Entry not found');

    if (dto.title !== undefined) existing.title = dto.title;
    if (dto.content !== undefined) existing.content = dto.content;
    if (dto.version !== undefined) existing.version = dto.version;

    if (dto.isPublished !== undefined) {
      // Transitioning from draft → published
      if (dto.isPublished && !existing.isPublished) {
        existing.publishedAt = new Date();
      }
      // Transitioning from published → draft
      if (!dto.isPublished && existing.isPublished) {
        existing.publishedAt = null;
      }
      existing.isPublished = dto.isPublished;
    }

    await existing.save();
    return existing;
  }

  /** Delete an entry by ID. */
  async delete(id: string) {
    const result = await this.entryModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Entry not found');
    return { message: 'Entry deleted' };
  }

  /** Return all entries (admin view — includes drafts). */
  async findAll() {
    return this.entryModel.find().sort({ createdAt: -1 }).limit(200).exec();
  }

  /** Return only published entries (user-facing). */
  async findPublished() {
    return this.entryModel
      .find({ isPublished: true })
      .sort({ publishedAt: -1 })
      .limit(200)
      .exec();
  }
}
