import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Client } from './clients/entities/client.entity';
import { DatabaseModule } from './database/database.module';
import { Employee } from './employees/entities/employee.entity';
import { Inquiry } from './inquiries/entities/inquiry.entity';
import { InquiriesModule } from './inquiries/inquiries.module';
import { Item } from './items/entities/item.entity';
import { ItemsModule } from './items/items.module';
import { User } from './users/entities/user.entity';
import { SettingsModule } from './settings/settings.module';
import { Setting } from './settings/entities/setting.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'baghub'),
        password: config.get<string>('DB_PASSWORD', 'baghub'),
        database: config.get<string>('DB_DATABASE', 'baghub'),
        entities: [Item, Inquiry, User, Employee, Client, Setting],
        synchronize:
          config.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),
    DatabaseModule,
    AuthModule,
    ItemsModule,
    InquiriesModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
