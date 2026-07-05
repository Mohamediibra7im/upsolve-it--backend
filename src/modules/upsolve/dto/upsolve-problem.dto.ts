import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateUpsolveProblemDto {
  @IsInt()
  @Min(1)
  contestId!: number;

  @IsString()
  @IsNotEmpty()
  index!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(0)
  rating!: number;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsNumber()
  solvedTime?: number | null;
}

export class UpdateUpsolveProblemDto {
  @IsInt()
  @Min(1)
  contestId!: number;

  @IsString()
  @IsNotEmpty()
  index!: string;

  @IsOptional()
  @IsNumber()
  solvedTime?: number | null;
}

export class DeleteUpsolveProblemDto {
  @IsInt()
  @Min(1)
  contestId!: number;

  @IsString()
  @IsNotEmpty()
  index!: string;
}
