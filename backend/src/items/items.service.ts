import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { Item } from './entities/item.entity';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemsRepo: Repository<Item>,
  ) {}

  findAll(): Promise<Item[]> {
    return this.itemsRepo.find({ order: { createdAt: 'DESC' } });
  }

  create(dto: CreateItemDto, userId?: string): Promise<Item> {
    const row = this.itemsRepo.create({
      title: dto.title.trim(),
      createdById: userId ?? null,
      updatedById: userId ?? null,
    });
    return this.itemsRepo.save(row);
  }
}
