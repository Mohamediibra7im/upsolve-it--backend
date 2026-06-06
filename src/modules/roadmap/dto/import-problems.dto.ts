import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ImportProblemsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contestId?: number;

  @IsOptional()
  force?: boolean;
}
