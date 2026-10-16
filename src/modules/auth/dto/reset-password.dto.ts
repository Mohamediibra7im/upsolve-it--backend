import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsOptional()
  @IsString()
  resetToken?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsOptional()
  @IsString()
  oldPassword?: string;
}
