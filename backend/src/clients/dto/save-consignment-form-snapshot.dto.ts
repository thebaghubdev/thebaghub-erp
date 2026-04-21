import { IsObject } from 'class-validator';

export class SaveConsignmentFormSnapshotDto {
  @IsObject()
  snapshot!: Record<string, unknown>;
}
