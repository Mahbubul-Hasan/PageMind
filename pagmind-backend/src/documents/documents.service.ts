import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly repo: Repository<Document>,
  ) {}

  async findAll(): Promise<Document[]> {
    return this.repo.find({ order: { updatedAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Document> {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Document "${id}" not found`);
    return doc;
  }

  async create(dto: CreateDocumentDto): Promise<Document> {
    const doc = this.repo.create(dto);
    return this.repo.save(doc);
  }

  async update(id: string, dto: UpdateDocumentDto): Promise<Document> {
    const doc = await this.findOne(id);
    Object.assign(doc, dto);
    return this.repo.save(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findOne(id);
    await this.repo.remove(doc);
  }
}
