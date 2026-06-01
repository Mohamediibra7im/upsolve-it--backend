import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateProblemDto {
  @IsString()
  cfProblemId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  xpReward?: number;
}
