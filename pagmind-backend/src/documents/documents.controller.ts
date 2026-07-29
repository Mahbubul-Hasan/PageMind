import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all saved documents' })
  async findAll() {
    return this.docs.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  async findOne(@Param('id') id: string) {
    return this.docs.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new document (page content, CV, notes, etc.)' })
  async create(@Body() dto: CreateDocumentDto) {
    return this.docs.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a document' })
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.docs.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  async remove(@Param('id') id: string) {
    await this.docs.remove(id);
    return { ok: true };
  }
}
