import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessControlModule } from '../access-control/access-control.module';
import { ClientConsignmentFormController } from './client-consignment-form.controller';
import { Setting } from './entities/setting.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AccessControlModule, TypeOrmModule.forFeature([Setting])],
  controllers: [SettingsController, ClientConsignmentFormController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
