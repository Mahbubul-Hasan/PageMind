import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMessageDto } from './dto/add-message.dto';

@ApiTags('Conversations')
@Controller('conversations')
export class ConversationController {
  constructor(private readonly convo: ConversationService) {}

  @Get()
  @ApiOperation({ summary: 'List all conversations' })
  async findAll() {
    return this.convo.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation with messages' })
  async findOne(@Param('id') id: string) {
    return this.convo.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  async create(@Body() dto: CreateConversationDto) {
    return this.convo.create(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a conversation' })
  async remove(@Param('id') id: string) {
    await this.convo.remove(id);
    return { ok: true };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add a message to a conversation' })
  async addMessage(@Param('id') id: string, @Body() dto: AddMessageDto) {
    return this.convo.addMessage(id, dto);
  }
}
