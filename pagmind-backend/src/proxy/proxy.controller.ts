import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@ApiTags('Proxy')
@Controller('proxy')
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Proxy a chat completion request to an LLM provider' })
  async chat(@Body() dto: ChatRequestDto) {
    const text = await this.proxy.chat(dto);
    return { text };
  }
}
