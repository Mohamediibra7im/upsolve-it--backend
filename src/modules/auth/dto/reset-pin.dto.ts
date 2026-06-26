import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPinDto {
  @IsOptional()
  @IsString()
  resetToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;

  @IsOptional()
  @IsString()
  oldPassword?: string;
}
