import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpsertSheetDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsUrl()
  cfGroupUrl!: string;

  @IsOptional()
  @IsString()
  groupNote?: string;
}
