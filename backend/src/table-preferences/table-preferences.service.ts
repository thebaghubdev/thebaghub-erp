import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpsertTablePreferenceDto } from './dto/upsert-table-preference.dto';
import {
  TablePreference,
  TablePreferenceConfig,
} from './entities/table-preference.entity';

const TABLE_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,119}$/;
const MAX_COLUMNS = 100;
const MAX_FILTERS = 50;
const MAX_FILTER_STRING_LENGTH = 500;

export type TablePreferenceResponse = {
  tableId: string;
  config: TablePreferenceConfig | null;
};

function validateTableId(tableId: string): void {
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new BadRequestException(
      'tableId must be 1-120 lowercase letters, numbers, dots, or hyphens',
    );
  }
}

function uniqueCappedStrings(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 120) continue;
    seen.add(trimmed);
    if (seen.size >= MAX_COLUMNS) break;
  }
  return [...seen];
}

function sanitizeFilterValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.slice(0, MAX_FILTER_STRING_LENGTH);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_FILTERS).map(sanitizeFilterValue);
  }
  return String(value).slice(0, MAX_FILTER_STRING_LENGTH);
}

function sanitizeConfig(dto: UpsertTablePreferenceDto): TablePreferenceConfig {
  const config = dto.config;
  const columnOrder = uniqueCappedStrings(config.columnOrder);
  const left = uniqueCappedStrings(config.columnPinning?.left);
  const right = uniqueCappedStrings(config.columnPinning?.right);

  return {
    version: 1,
    ...(columnOrder?.length ? { columnOrder } : {}),
    ...(left?.length || right?.length
      ? { columnPinning: { left: left ?? [], right: right ?? [] } }
      : {}),
    ...(config.sorting?.length
      ? {
          sorting: config.sorting.slice(0, MAX_FILTERS).map((sort) => ({
            id: sort.id.trim(),
            desc: Boolean(sort.desc),
          })),
        }
      : {}),
    ...(config.columnFilters?.length
      ? {
          columnFilters: config.columnFilters
            .slice(0, MAX_FILTERS)
            .map((filter) => ({
              id: filter.id.trim(),
              value: sanitizeFilterValue(filter.value),
            }))
            .filter((filter) => filter.id.length > 0),
        }
      : {}),
    ...(config.globalFilter
      ? { globalFilter: config.globalFilter.slice(0, MAX_FILTER_STRING_LENGTH) }
      : {}),
    ...(config.pagination?.pageSize
      ? { pagination: { pageSize: config.pagination.pageSize } }
      : {}),
  };
}

@Injectable()
export class TablePreferencesService {
  constructor(
    @InjectRepository(TablePreference)
    private readonly tablePreferencesRepo: Repository<TablePreference>,
  ) {}

  async findForUser(
    userId: string,
    tableId: string,
  ): Promise<TablePreferenceResponse> {
    validateTableId(tableId);
    const preference = await this.tablePreferencesRepo.findOne({
      where: { userId, tableId },
    });
    return {
      tableId,
      config: preference?.config ?? null,
    };
  }

  async upsertForUser(
    userId: string,
    tableId: string,
    dto: UpsertTablePreferenceDto,
  ): Promise<TablePreferenceResponse> {
    validateTableId(tableId);
    const config = sanitizeConfig(dto);
    const existing = await this.tablePreferencesRepo.findOne({
      where: { userId, tableId },
    });
    const preference = existing
      ? this.tablePreferencesRepo.merge(existing, { config })
      : this.tablePreferencesRepo.create({ userId, tableId, config });
    const saved = await this.tablePreferencesRepo.save(preference);
    return { tableId: saved.tableId, config: saved.config };
  }
}
