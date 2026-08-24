import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AccessLevel } from './access-level.enum';
import { UpdateAccessMatrixDto } from './dto/update-access-matrix.dto';
import { FeatureAccess } from './entities/feature-access.entity';
import {
  MANAGED_FEATURE_KEYS,
  MANAGED_FEATURE_LABELS,
  ManagedFeatureKey,
  accessLevelSatisfies,
  isManagedFeatureKey,
  isSingleGrantFeature,
  type AccessLevel as AccessLevelAlias,
} from './feature-keys';

export type FeatureMatrixRow = {
  featureKey: ManagedFeatureKey;
  label: string;
  viewEmployeeIds: string[];
  editEmployeeIds: string[];
};

export type MyAccessMap = Partial<Record<ManagedFeatureKey, AccessLevelAlias>>;

@Injectable()
export class FeatureAccessService {
  constructor(
    @InjectRepository(FeatureAccess)
    private readonly accessRepo: Repository<FeatureAccess>,
    @InjectRepository(Employee)
    private readonly employeesRepo: Repository<Employee>,
  ) {}

  async findEmployeeByUserId(userId: string): Promise<Employee | null> {
    return this.employeesRepo.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  async findEmployeeIdsWithEditAccess(
    featureKey: ManagedFeatureKey,
  ): Promise<string[]> {
    const rows = await this.accessRepo.find({
      where: { featureKey, accessLevel: AccessLevel.EDIT },
    });
    return rows.map((row) => row.employeeId);
  }

  async hasAccess(
    userId: string,
    isAdmin: boolean,
    featureKey: ManagedFeatureKey,
    minLevel: AccessLevelAlias,
    orFeatureKeys: ManagedFeatureKey[] = [],
  ): Promise<boolean> {
    if (isAdmin) return true;

    const keys = [featureKey, ...orFeatureKeys];
    for (const key of keys) {
      const level = await this.getEmployeeAccessLevel(userId, key);
      if (accessLevelSatisfies(level, minLevel)) return true;
    }
    return false;
  }

  async assertAccess(
    userId: string,
    isAdmin: boolean,
    featureKey: ManagedFeatureKey,
    minLevel: AccessLevelAlias,
    orFeatureKeys: ManagedFeatureKey[] = [],
  ): Promise<void> {
    const ok = await this.hasAccess(
      userId,
      isAdmin,
      featureKey,
      minLevel,
      orFeatureKeys,
    );
    if (!ok) {
      throw new ForbiddenException(
        `You do not have ${minLevel} access to this feature`,
      );
    }
  }

  private async getEmployeeAccessLevel(
    userId: string,
    featureKey: ManagedFeatureKey,
  ): Promise<AccessLevelAlias | null> {
    const employee = await this.employeesRepo.findOne({ where: { userId } });
    if (!employee) return null;

    const row = await this.accessRepo.findOne({
      where: { employeeId: employee.id, featureKey },
    });
    return (row?.accessLevel as AccessLevelAlias | undefined) ?? null;
  }

  async getMyAccess(userId: string, isAdmin: boolean): Promise<MyAccessMap> {
    if (isAdmin) {
      const map: MyAccessMap = {};
      for (const key of MANAGED_FEATURE_KEYS) {
        map[key] = 'edit';
      }
      return map;
    }

    const employee = await this.employeesRepo.findOne({ where: { userId } });
    if (!employee) return {};

    const rows = await this.accessRepo.find({
      where: { employeeId: employee.id },
    });
    const map: MyAccessMap = {};
    for (const row of rows) {
      if (isManagedFeatureKey(row.featureKey)) {
        map[row.featureKey] = row.accessLevel as AccessLevelAlias;
      }
    }
    return map;
  }

  async getMatrix(): Promise<FeatureMatrixRow[]> {
    const rows = await this.accessRepo.find();
    const byFeature = new Map<
      ManagedFeatureKey,
      { viewEmployeeIds: string[]; editEmployeeIds: string[] }
    >();

    for (const key of MANAGED_FEATURE_KEYS) {
      byFeature.set(key, { viewEmployeeIds: [], editEmployeeIds: [] });
    }

    for (const row of rows) {
      if (!isManagedFeatureKey(row.featureKey)) continue;
      const bucket = byFeature.get(row.featureKey);
      if (!bucket) continue;
      if (row.accessLevel === AccessLevel.EDIT) {
        bucket.editEmployeeIds.push(row.employeeId);
      } else {
        bucket.viewEmployeeIds.push(row.employeeId);
      }
    }

    return MANAGED_FEATURE_KEYS.map((featureKey) => {
      const bucket = byFeature.get(featureKey)!;
      return {
        featureKey,
        label: MANAGED_FEATURE_LABELS[featureKey],
        viewEmployeeIds: bucket.viewEmployeeIds,
        editEmployeeIds: bucket.editEmployeeIds,
      };
    });
  }

  async replaceMatrix(
    dto: UpdateAccessMatrixDto,
    actorUserId: string,
  ): Promise<FeatureMatrixRow[]> {
    const seen = new Set<string>();
    for (const row of dto.features) {
      if (seen.has(row.featureKey)) {
        throw new BadRequestException(
          `Duplicate feature key in payload: ${row.featureKey}`,
        );
      }
      seen.add(row.featureKey);

      if (isSingleGrantFeature(row.featureKey) && row.viewEmployeeIds.length > 0) {
        throw new BadRequestException(
          `${row.featureKey} does not support view-only access`,
        );
      }

      const overlap = row.viewEmployeeIds.filter((id) =>
        row.editEmployeeIds.includes(id),
      );
      if (overlap.length > 0) {
        throw new BadRequestException(
          `Employees cannot have both view and edit access for ${row.featureKey}`,
        );
      }
    }

    const allEmployeeIds = [
      ...new Set(
        dto.features.flatMap((r) => [
          ...r.viewEmployeeIds,
          ...r.editEmployeeIds,
        ]),
      ),
    ];

    if (allEmployeeIds.length > 0) {
      const employees = await this.employeesRepo.find({
        where: { id: In(allEmployeeIds) },
        relations: ['user'],
      });
      if (employees.length !== allEmployeeIds.length) {
        throw new BadRequestException('One or more employees were not found');
      }
      const adminIds = employees
        .filter((e) => e.user?.isAdmin)
        .map((e) => e.id);
      if (adminIds.length > 0) {
        throw new BadRequestException(
          'Administrator accounts have implicit full access and cannot be assigned',
        );
      }
    }

    const expectedKeys = new Set<string>(MANAGED_FEATURE_KEYS);
    for (const key of expectedKeys) {
      if (!seen.has(key)) {
        throw new BadRequestException(
          `Missing feature in matrix payload: ${key}`,
        );
      }
    }
    for (const key of seen) {
      if (!expectedKeys.has(key)) {
        throw new BadRequestException(`Unknown feature key: ${key}`);
      }
    }

    await this.accessRepo.manager.transaction(async (em) => {
      await em.createQueryBuilder().delete().from(FeatureAccess).execute();

      const toInsert: FeatureAccess[] = [];
      for (const row of dto.features) {
        for (const employeeId of row.viewEmployeeIds) {
          toInsert.push(
            em.create(FeatureAccess, {
              featureKey: row.featureKey,
              employeeId,
              accessLevel: AccessLevel.VIEW,
              createdById: actorUserId,
              updatedById: actorUserId,
            }),
          );
        }
        for (const employeeId of row.editEmployeeIds) {
          toInsert.push(
            em.create(FeatureAccess, {
              featureKey: row.featureKey,
              employeeId,
              accessLevel: AccessLevel.EDIT,
              createdById: actorUserId,
              updatedById: actorUserId,
            }),
          );
        }
      }
      if (toInsert.length > 0) {
        await em.save(FeatureAccess, toInsert);
      }
    });

    return this.getMatrix();
  }
}
