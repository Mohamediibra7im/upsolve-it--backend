import { IsArray, IsString } from 'class-validator';

export class GrantLevelAccessDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}
