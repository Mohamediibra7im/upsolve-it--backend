import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subtopics?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requiredLearningPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requiredProblemPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  topicXpReward?: number;

  @IsOptional()
  @IsString()
  groupLinks?: string;

  @IsOptional()
  @IsString()
  groupNote?: string;
}
