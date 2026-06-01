import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class UpsertVideoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsUrl()
  youtubeUrl!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSec?: number;
}
