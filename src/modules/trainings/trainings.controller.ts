import {
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Body,
  Param,
  Req,
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
    @Req() req: any,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization, req.cookies?.accessToken);
    if (!user) throw new UnauthorizedException('Unauthorized');
    const training = await this.trainings.createTraining(
      String(user._id),
      body,
    );
    return { message: 'Training saved successfully', training };
  }

  @Get()
  async list(@Headers('authorization') authorization: string | undefined, @Req() req: any) {
    const user = await this.trainings.getUserFromAuthHeader(authorization, req.cookies?.accessToken);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.trainings.listTrainings(String(user._id));
  }

  @Delete(':id')
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const user = await this.trainings.getUserFromAuthHeader(authorization, req.cookies?.accessToken);
    if (!user) throw new UnauthorizedException('Unauthorized');
    return await this.trainings.deleteTraining(String(user._id), id);
  }
}
