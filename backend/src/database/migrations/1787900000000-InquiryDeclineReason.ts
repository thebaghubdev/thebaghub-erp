import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryDeclineReason1787900000000 implements MigrationInterface {
  name = 'InquiryDeclineReason1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "decline_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP COLUMN "decline_reason"`,
    );
  }
}
