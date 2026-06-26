import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class DeleteProblemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  problemIds!: string[];
}
