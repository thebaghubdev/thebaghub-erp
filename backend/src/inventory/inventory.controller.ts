import { Controller, Get, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../auth/staff-only.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(StaffOnlyGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAllForStaff();
  }
}
