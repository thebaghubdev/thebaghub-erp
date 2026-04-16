import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateAuthenticationMetricDto } from './dto/create-authentication-metric.dto';
import { AuthenticationMetric } from './entities/authentication-metric.entity';

@Injectable()
export class AuthenticationMetricsService {
  constructor(
    @InjectRepository(AuthenticationMetric)
    private readonly repo: Repository<AuthenticationMetric>,
  ) {}

  findAll(): Promise<AuthenticationMetric[]> {
    return this.repo.find({
      order: {
        category: 'ASC',
        metricCategory: 'ASC',
        metric: 'ASC',
      },
    });
  }

  async softDeleteByIds(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) {
      return { deleted: 0 };
    }
    const result = await this.repo.softDelete({ id: In(ids) });
    return { deleted: result.affected ?? 0 };
  }

  create(dto: CreateAuthenticationMetricDto): Promise<AuthenticationMetric> {
    const description =
      dto.description != null && String(dto.description).trim() !== ''
        ? String(dto.description).trim()
        : null;
    const entity = this.repo.create({
      category: dto.category.trim(),
      metricCategory: dto.metricCategory.trim(),
      metric: dto.metric.trim(),
      description,
      isCustom: dto.isCustom,
      brand: dto.isCustom ? (dto.brand!.trim() ?? null) : null,
      model: dto.isCustom
        ? dto.model != null && String(dto.model).trim() !== ''
          ? String(dto.model).trim()
          : null
        : null,
    });
    return this.repo.save(entity);
  }
}
