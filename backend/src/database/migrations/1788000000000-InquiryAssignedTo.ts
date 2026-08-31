import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryAssignedTo1788000000000 implements MigrationInterface {
  name = 'InquiryAssignedTo1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "assigned_to_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP CONSTRAINT IF EXISTS "FK_inquiries_assigned_to_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD CONSTRAINT "FK_inquiries_assigned_to_id" FOREIGN KEY ("assigned_to_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP CONSTRAINT IF EXISTS "FK_inquiries_assigned_to_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP COLUMN IF EXISTS "assigned_to_id"`,
    );
  }
}
