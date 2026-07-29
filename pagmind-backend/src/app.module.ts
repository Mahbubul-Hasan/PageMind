import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProxyModule } from './proxy/proxy.module';
import { DocumentsModule } from './documents/documents.module';
import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get('DATABASE_PATH') || './data/pagmind.db',
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    ProxyModule,
    DocumentsModule,
    ConversationModule,
  ],
})
export class AppModule {}
