import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRequestDto } from './dto/chat-request.dto';

@Injectable()
export class ProxyService {
  constructor(private readonly config: ConfigService) {}

  async chat(dto: ChatRequestDto): Promise<string> {
    const apiKey = dto.apiKey || this.config.get('API_KEY');
    const url = dto.baseUrl || this.config.get('BASE_URL') || 'https://api.openai.com/v1/chat/completions';
    const model = dto.model || this.config.get('MODEL') || 'gpt-4o-mini';

    if (!apiKey) {
      throw new HttpException(
        'API key is required — set API_KEY in .env or send in request body',
        HttpStatus.BAD_REQUEST,
      );
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: dto.messages,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new HttpException(
        `LLM API error (${res.status}): ${text}`,
        res.status,
      );
    }

    const data = await res.json();

    if (url.includes('anthropic') || url.includes('api.anthropic.com')) {
      return data.content?.[0]?.text || '';
    }

    return data.choices?.[0]?.message?.content || '';
  }
}
