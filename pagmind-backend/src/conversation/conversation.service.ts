import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMessageDto } from './dto/add-message.dto';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convoRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
  ) {}

  async findAll(): Promise<Conversation[]> {
    return this.convoRepo.find({
      order: { updatedAt: 'DESC' },
      relations: ['messages'],
    });
  }

  async findOne(id: string): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id },
      relations: ['messages'],
    });
    if (!convo) throw new NotFoundException(`Conversation "${id}" not found`);
    return convo;
  }

  async create(dto: CreateConversationDto): Promise<Conversation> {
    const convo = this.convoRepo.create(dto);
    return this.convoRepo.save(convo);
  }

  async remove(id: string): Promise<void> {
    const convo = await this.findOne(id);
    await this.convoRepo.remove(convo);
  }

  async addMessage(conversationId: string, dto: AddMessageDto): Promise<Message> {
    await this.findOne(conversationId);
    const msg = this.msgRepo.create({
      ...dto,
      conversation: { id: conversationId } as Conversation,
      conversationId,
    });
    await this.convoRepo.update(conversationId, { updatedAt: new Date() });
    return this.msgRepo.save(msg);
  }
}
