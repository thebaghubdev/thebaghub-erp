import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventoryOriginalBranch1788200000000
  implements MigrationInterface
{
  name = 'InventoryOriginalBranch1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD COLUMN IF NOT EXISTS "original_branch" character varying(32)
    `);
    await queryRunner.query(`
      UPDATE "inventory_items" i
      SET "original_branch" = src."sending_branch"
      FROM (
        SELECT DISTINCT ON (li."inventory_item_id")
          li."inventory_item_id",
          l."sending_branch"
        FROM "logistics_items" li
        INNER JOIN "logistics" l ON l."id" = li."logistics_id"
        WHERE l."status" <> 'Cancelled'
        ORDER BY li."inventory_item_id", l."created_at" ASC
      ) src
      WHERE i."id" = src."inventory_item_id"
        AND i."original_branch" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "original_branch" = "current_branch"
      WHERE "original_branch" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ALTER COLUMN "original_branch" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        DROP COLUMN IF EXISTS "original_branch"
    `);
  }
}
