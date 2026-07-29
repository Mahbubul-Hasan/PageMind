import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocumentDto {
  @ApiProperty({ example: 'My Resume' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Experience: ...' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: 'https://docs.google.com/document/...' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;
}
