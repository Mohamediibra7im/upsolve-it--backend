import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Suggestion,
  type SuggestionDocument,
} from './schemas/suggestion.schema';

export interface CreateSuggestionDto {
  title: string;
  description: string;
  url: string;
  category?: string;
  isActive?: boolean;
  order?: number;
}

export interface UpdateSuggestionDto {
  title?: string;
  description?: string;
  url?: string;
  category?: string;
  isActive?: boolean;
  order?: number;
}

@Injectable()
export class SuggestionsService {
  constructor(
    @InjectModel(Suggestion.name)
    private readonly model: Model<SuggestionDocument>,
  ) {}

  async create(dto: CreateSuggestionDto) {
    return this.model.create({
      title: dto.title,
      description: dto.description,
      url: dto.url,
      category: dto.category ?? '',
      isActive: dto.isActive ?? true,
      order: dto.order ?? 0,
    });
  }

  async update(id: string, dto: UpdateSuggestionDto) {
    const existing = await this.model.findById(id);
    if (!existing) throw new NotFoundException('Suggestion not found');

    if (dto.title !== undefined) existing.title = dto.title;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.url !== undefined) existing.url = dto.url;
    if (dto.category !== undefined) existing.category = dto.category;
    if (dto.isActive !== undefined) existing.isActive = dto.isActive;
    if (dto.order !== undefined) existing.order = dto.order;

    await existing.save();
    return existing;
  }

  async delete(id: string) {
    const result = await this.model.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Suggestion not found');
    return { message: 'Suggestion deleted' };
  }

  async findAll() {
    return this.model.find().sort({ order: 1, createdAt: -1 }).limit(200).exec();
  }

  async findActive() {
    return this.model
      .find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(200)
      .exec();
  }
}
