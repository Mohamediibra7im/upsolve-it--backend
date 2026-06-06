import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['Arabic', 'English'])
  language?: 'Arabic' | 'English';

  @IsOptional()
  @IsEnum([
    'Video',
    'Article',
    'Documentation',
    'Tutorial',
    'Course',
    'PDF',
    'Website',
  ])
  type?:
    | 'Video'
    | 'Article'
    | 'Documentation'
    | 'Tutorial'
    | 'Course'
    | 'PDF'
    | 'Website';

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  xpReward?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  videoCompletionThresholdPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex?: number;
}
