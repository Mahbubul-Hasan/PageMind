import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMessageDto {
  @ApiProperty({ example: 'user' })
  @IsString()
  role: string;

  @ApiProperty({ example: 'Hello' })
  @IsString()
  content: string;
}
