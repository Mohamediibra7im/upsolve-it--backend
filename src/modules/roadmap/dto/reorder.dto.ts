import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ReorderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex!: number;
}
