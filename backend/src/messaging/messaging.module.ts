import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Employee } from '../employees/entities/employee.entity';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Employee])],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
