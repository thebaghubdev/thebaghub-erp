import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BRANDS_WE_CONSIGN_KEY,
  ITEM_CATEGORIES_KEY,
} from './consignment-setting-keys';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Setting } from './entities/setting.entity';

function parseStringArraySetting(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

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

  /** Picklists for the client consign form; any authenticated user (including clients). */
  async getConsignmentFormPicklists(): Promise<{
    brands: string[];
    categories: string[];
  }> {
    const [brandsRow, categoriesRow] = await Promise.all([
      this.settingsRepo.findOne({ where: { key: BRANDS_WE_CONSIGN_KEY } }),
      this.settingsRepo.findOne({ where: { key: ITEM_CATEGORIES_KEY } }),
    ]);
    return {
      brands: brandsRow ? parseStringArraySetting(brandsRow.value) : [],
      categories: categoriesRow
        ? parseStringArraySetting(categoriesRow.value)
        : [],
    };
  }
}
