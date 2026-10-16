import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyResetProfileDto {
  @IsString()
  @IsNotEmpty()
  verificationToken!: string;
}
