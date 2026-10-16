import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class LanguageDto {
  @IsOptional()
  @IsEnum(['Arabic', 'English'])
  language?: 'Arabic' | 'English';
}

export class ToggleProblemDto extends LanguageDto {
  @IsBoolean()
  solved!: boolean;
}

export class ResourceProgressDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  watchPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  positionSec?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
