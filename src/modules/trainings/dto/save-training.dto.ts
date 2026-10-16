import { IsNumber, IsOptional } from 'class-validator';
import { CreateTrainingDto } from './create-training.dto';

export class SaveTrainingDto extends CreateTrainingDto {
  // Accepted for older clients; the server always derives the actual score.
  @IsOptional()
  @IsNumber()
  performance?: number;
}
