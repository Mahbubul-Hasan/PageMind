import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', default: 'New conversation' })
  title: string;

  @Column({ type: 'text', nullable: true })
  pageUrl: string;

  @Column({ type: 'text', nullable: true })
  pageTitle: string;

  @OneToMany(() => Message, (msg) => msg.conversation, {
    cascade: true,
    eager: true,
  })
  @Column({ type: 'text', nullable: true })
  pageContext: string;

  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
