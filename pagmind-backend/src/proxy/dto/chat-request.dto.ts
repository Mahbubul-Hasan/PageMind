import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: 'user' })
  @IsString()
  role: string;

  @ApiProperty({ example: 'Hello' })
  @IsString()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiPropertyOptional({ example: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'sk-...' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ example: 'https://api.openai.com/v1/chat/completions' })
  @IsOptional()
  @IsString()
  baseUrl?: string;
}
