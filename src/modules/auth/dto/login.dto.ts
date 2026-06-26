import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  codeforcesHandle!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
