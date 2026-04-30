import {
  Controller,
  Get,
  Headers,
  Post,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service';

@Controller('trainings')
export class TrainingsController {
  constructor(private readonly trainings: TrainingsService) {}

  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const training = await this.trainings.createTraining(
      String(user._id),
      body,
    );
    return { message: 'Training saved successfully', training };
  }

  @Get()
  async list(@Headers('authorization') authorization: string | undefined) {
    const user = await this.trainings.getUserFromAuthHeader(authorization);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.trainings.listTrainings(String(user._id));
  }
}
