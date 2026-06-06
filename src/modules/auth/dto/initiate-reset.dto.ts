import { IsString, IsNotEmpty } from 'class-validator';

export class InitiateResetDto {
  @IsString()
  @IsNotEmpty()
  handle!: string;
}
