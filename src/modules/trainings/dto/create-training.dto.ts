import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TrainingProblemDto {
  @IsOptional()
  @IsString()
  problemId?: string;

  @IsInt()
  @Min(1)
  contestId!: number;

  @IsString()
  index!: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  rating!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  url!: string;

  @IsOptional()
  @IsNumber()
  startedAt?: number | null;

  @IsOptional()
  @IsNumber()
  solvedAt?: number | null;

  @IsOptional()
  @IsNumber()
  timeSpentSeconds?: number | null;

  @IsOptional()
  @IsNumber()
  expectedTimeSeconds?: number | null;

  @IsOptional()
  @IsEnum(['fast', 'normal', 'slow', 'unsolved'])
  speedStatus?: 'fast' | 'normal' | 'slow' | 'unsolved';

  @IsOptional()
  @IsInt()
  @Min(0)
  attempts?: number;

  @IsOptional()
  @IsBoolean()
  isSolved?: boolean;

  @IsOptional()
  @IsString()
  insightMessage?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;

  @IsOptional()
  @IsNumber()
  solvedTime?: number | null;
}

export class CustomRatingsDto {
  @IsOptional()
  @IsNumber()
  P1?: number;

  @IsOptional()
  @IsNumber()
  P2?: number;

  @IsOptional()
  @IsNumber()
  P3?: number;

  @IsOptional()
  @IsNumber()
  P4?: number;

  @IsOptional()
  @IsNumber()
  P5?: number;

  @IsOptional()
  @IsNumber()
  P6?: number;

  @IsOptional()
  @IsNumber()
  P7?: number;

  @IsOptional()
  @IsNumber()
  P8?: number;
}

export class CreateTrainingDto {
  @IsNumber()
  startTime!: number;

  @IsNumber()
  endTime!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomRatingsDto)
  customRatings?: CustomRatingsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingProblemDto)
  problems!: TrainingProblemDto[];

  @IsOptional()
  @IsEnum(['ladder', 'weakness', 'speed', 'contest', 'endurance'])
  trainingMode?: 'ladder' | 'weakness' | 'speed' | 'contest' | 'endurance';

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsNumber()
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(['active', 'completed', 'abandoned'])
  status?: 'active' | 'completed' | 'abandoned';

  @IsOptional()
  @IsNumber()
  solvedCount?: number;

  @IsOptional()
  @IsBoolean()
  reviewGenerated?: boolean;

  @IsOptional()
  @IsBoolean()
  showRatings?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagsFilter?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  weaknessFallback?: boolean;
}
