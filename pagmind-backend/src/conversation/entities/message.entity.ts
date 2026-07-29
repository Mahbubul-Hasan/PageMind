import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  role: string;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Conversation, (convo) => convo.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'text', nullable: true })
  conversationId: string;

  @CreateDateColumn()
  createdAt: Date;
}
