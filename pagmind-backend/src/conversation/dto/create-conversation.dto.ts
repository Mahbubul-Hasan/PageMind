import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'My conversation' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional({ example: 'Page Title' })
  @IsOptional()
  @IsString()
  pageTitle?: string;

  @ApiPropertyOptional({ example: 'Page content...' })
  @IsOptional()
  @IsString()
  pageContext?: string;
}
