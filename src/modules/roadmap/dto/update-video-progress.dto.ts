import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateVideoProgressDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  watchPct!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  positionSec!: number;
}
