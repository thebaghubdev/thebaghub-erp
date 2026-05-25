import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TablePreference } from './entities/table-preference.entity';
import { TablePreferencesController } from './table-preferences.controller';
import { TablePreferencesService } from './table-preferences.service';

@Module({
  imports: [TypeOrmModule.forFeature([TablePreference])],
  controllers: [TablePreferencesController],
  providers: [TablePreferencesService],
})
export class TablePreferencesModule {}
