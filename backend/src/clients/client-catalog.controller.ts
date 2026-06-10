import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientOnlyGuard } from '../auth/client-only.guard';
import { JwtUser } from '../auth/jwt-user';
import { ClientCatalogService } from './client-catalog.service';

@Controller('client/item-catalog')
@UseGuards(ClientOnlyGuard)
export class ClientCatalogController {
  constructor(private readonly clientCatalogService: ClientCatalogService) {}

  @Get()
  findAvailableItems() {
    return this.clientCatalogService.findAvailableItems();
  }

  @Get(':id')
  findAvailableItemDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientCatalogService.findAvailableItemDetail(id);
  }

  @Post(':id/waitlist')
  addToWaitlist(
    @Req() req: { user: JwtUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientCatalogService.addToWaitlist(req.user, id);
  }
}
