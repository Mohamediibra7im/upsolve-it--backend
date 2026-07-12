import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsMongoId,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateRoleDto {
  @IsMongoId()
  userId!: string;

  @IsIn(['admin', 'user'])
  role!: 'admin' | 'user';
}

export class SyncBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  userIds!: string[];
}

export class ReplyMessageDto {
  @IsString()
  @MaxLength(10000)
  message!: string;
}
