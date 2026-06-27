import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, type UserDocument } from '../auth/schemas/user.schema';
import { TrainingsService } from './trainings.service';

@UseGuards(AuthGuard)
@Controller('trainings')
export class TrainingsController {
  constructor(private readonly trainings: TrainingsService) {}

  @Post()
  async create(
    @Body() body: any,
    @CurrentUser() user: UserDocument,
  ) {
    const training = await this.trainings.createTraining(
      user._id.toString(),
      body,
    );
    return { message: 'Training saved successfully', training };
  }

  @Get()
  async list(@CurrentUser() user: UserDocument) {
    return await this.trainings.listTrainings(user._id.toString());
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    return await this.trainings.deleteTraining(user._id.toString(), id);
  }
}
