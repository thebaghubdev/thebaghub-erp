import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientConsignmentFormController } from './client-consignment-form.controller';
import { Setting } from './entities/setting.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  controllers: [SettingsController, ClientConsignmentFormController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
