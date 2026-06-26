import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  codeforcesHandle!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  confirmPassword!: string;
}
