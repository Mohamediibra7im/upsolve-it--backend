import { Controller, Get } from '@nestjs/common';
import { TrainingLevelsService } from './training-levels.service';

@Controller('levels')
export class TrainingLevelsController {
  constructor(private readonly trainingLevels: TrainingLevelsService) {}

  /** Public: training UI reads ladder targets (P1–P4 derived client-side). */
  @Get()
  async list() {
    const levels = await this.trainingLevels.findAllForClient();
    return { levels };
  }
}
