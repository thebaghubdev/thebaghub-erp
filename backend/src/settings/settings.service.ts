import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Setting } from './entities/setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingsRepo: Repository<Setting>,
  ) {}

  findAll(): Promise<Setting[]> {
    return this.settingsRepo.find({
      order: { category: 'ASC', key: 'ASC' },
    });
  }

  async findOneByKey(key: string): Promise<Setting> {
    const row = await this.settingsRepo.findOne({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Setting "${key}" not found`);
    }
    return row;
  }

  async updateByKey(key: string, dto: UpdateSettingDto): Promise<Setting> {
    const row = await this.findOneByKey(key);
    row.value = dto.value;
    return this.settingsRepo.save(row);
  }
}
