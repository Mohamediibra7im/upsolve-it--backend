import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Min,
  Max,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';

export class LevelRowDto {
  @IsInt()
  @Min(1)
  id!: number;

  @IsString()
  level!: string;

  @IsString()
  time!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? Number.parseInt(value, 10) : Number(value),
  )
  @IsNumber()
  @Min(800)
  /** Canonical seed tops out at 4050; allow headroom for extra rows beyond level 110. */
  @Max(4100)
  Performance!: number;
}

export class ReplaceLevelsBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LevelRowDto)
  levels!: LevelRowDto[];
}
