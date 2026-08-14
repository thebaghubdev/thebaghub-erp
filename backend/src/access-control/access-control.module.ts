import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Employee } from '../employees/entities/employee.entity';
import { AccessControlController } from './access-control.controller';
import { FeatureAccess } from './entities/feature-access.entity';
import { FeatureAccessGuard } from './feature-access.guard';
import { FeatureAccessService } from './feature-access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureAccess, Employee]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AccessControlController],
  providers: [FeatureAccessService, FeatureAccessGuard],
  exports: [FeatureAccessService, FeatureAccessGuard],
})
export class AccessControlModule {}
