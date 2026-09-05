import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthenticationCoordinatorReturn1788100000000
  implements MigrationInterface
{
  name = 'AuthenticationCoordinatorReturn1788100000000';
  /** Enum ADD VALUE cannot be used in the same transaction as UPDATE to that value. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."inquiries_status_enum" ADD VALUE IF NOT EXISTS 'authenticated_returned_to_coordinator'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."inquiries_status_enum" ADD VALUE IF NOT EXISTS 'authenticated_returned_to_consignor'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."inquiries_status_enum" ADD VALUE IF NOT EXISTS 'for_authentication_payment_verification'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."inquiries_status_enum" ADD VALUE IF NOT EXISTS 'for_3rd_party_authentication'`,
    );

    await queryRunner.query(`
      ALTER TABLE "inquiries"
        ADD COLUMN IF NOT EXISTS "authentication_return_case" character varying(64),
        ADD COLUMN IF NOT EXISTS "coordinator_return_reason" text,
        ADD COLUMN IF NOT EXISTS "third_party_authentication_fee" numeric(12,2)
    `);

    await queryRunner.query(`
      UPDATE "inquiries"
      SET
        "authentication_return_case" = 'for_renegotiation',
        "status" = 'authenticated_returned_to_coordinator'
      WHERE "status" = 'authenticated_returned'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET
        "authentication_return_case" = 'for_renegotiation',
        "status" = 'authenticated_returned_to_consignor'
      WHERE "status" = 'authenticated_new_offer'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET
        "authentication_return_case" = 'for_3rd_party_authentication',
        "status" = 'for_authentication_payment_verification'
      WHERE "status" = 'authenticated_requested_for_reauthentication'
        AND "third_party_payment_status" = 'For payment verification'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET
        "authentication_return_case" = 'for_3rd_party_authentication',
        "status" = 'authenticated_returned_to_consignor'
      WHERE "status" = 'authenticated_requested_for_reauthentication'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET
        "authentication_return_case" = COALESCE("authentication_return_case", 'for_3rd_party_authentication'),
        "status" = 'for_3rd_party_authentication'
      WHERE "status" = 'authenticated_for_3rd_party'
    `);

    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'Authenticated - Returned to Coordinator'
      WHERE "status" = 'Authenticated: For renegotiation'
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'For authentication payment verification'
      WHERE "status" = 'Authenticated: Requested for Reauthentication'
        AND EXISTS (
          SELECT 1 FROM "inquiries" i
          WHERE i."id" = "inventory_items"."inquiry_id"
            AND i."status" = 'for_authentication_payment_verification'
        )
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'Authenticated - Returned to Consignor'
      WHERE "status" = 'Authenticated: Requested for Reauthentication'
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'For 3rd party authentication'
      WHERE "status" = 'Authenticated: For 3rd party authentication'
    `);

    await queryRunner.query(`
      UPDATE "item_authentication"
      SET "authentication_status" = 'Returned to Coordinator'
      WHERE "authentication_status" = 'For renegotiation'
    `);
    await queryRunner.query(`
      UPDATE "item_authentication" ia
      SET "authentication_status" = 'For authentication payment verification'
      FROM "inventory_items" inv
      WHERE ia."inventory_item_id" = inv."id"
        AND ia."authentication_status" = 'Requested for Reauthentication'
        AND inv."status" = 'For authentication payment verification'
    `);
    await queryRunner.query(`
      UPDATE "item_authentication"
      SET "authentication_status" = 'Returned to Consignor'
      WHERE "authentication_status" = 'Requested for Reauthentication'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "item_authentication"
      SET "authentication_status" = 'Requested for Reauthentication'
      WHERE "authentication_status" IN (
        'Returned to Consignor',
        'For authentication payment verification'
      )
    `);
    await queryRunner.query(`
      UPDATE "item_authentication"
      SET "authentication_status" = 'For renegotiation'
      WHERE "authentication_status" = 'Returned to Coordinator'
    `);

    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'Authenticated: For 3rd party authentication'
      WHERE "status" = 'For 3rd party authentication'
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'Authenticated: Requested for Reauthentication'
      WHERE "status" IN (
        'Authenticated - Returned to Consignor',
        'For authentication payment verification'
      )
        AND EXISTS (
          SELECT 1 FROM "inquiries" i
          WHERE i."id" = "inventory_items"."inquiry_id"
            AND i."authentication_return_case" IN (
              'for_3rd_party_authentication',
              'for_3rd_party_with_renegotiation'
            )
        )
    `);
    await queryRunner.query(`
      UPDATE "inventory_items"
      SET "status" = 'Authenticated: For renegotiation'
      WHERE "status" = 'Authenticated - Returned to Coordinator'
    `);

    await queryRunner.query(`
      UPDATE "inquiries"
      SET "status" = 'authenticated_for_3rd_party'
      WHERE "status" = 'for_3rd_party_authentication'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET "status" = 'authenticated_requested_for_reauthentication'
      WHERE "status" IN (
        'for_authentication_payment_verification'
      )
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET "status" = 'authenticated_requested_for_reauthentication'
      WHERE "status" = 'authenticated_returned_to_consignor'
        AND "authentication_return_case" IN (
          'for_3rd_party_authentication',
          'for_3rd_party_with_renegotiation'
        )
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET "status" = 'authenticated_new_offer'
      WHERE "status" = 'authenticated_returned_to_consignor'
    `);
    await queryRunner.query(`
      UPDATE "inquiries"
      SET "status" = 'authenticated_returned'
      WHERE "status" = 'authenticated_returned_to_coordinator'
    `);

    await queryRunner.query(`
      ALTER TABLE "inquiries"
        DROP COLUMN IF EXISTS "third_party_authentication_fee",
        DROP COLUMN IF EXISTS "coordinator_return_reason",
        DROP COLUMN IF EXISTS "authentication_return_case"
    `);
  }
}
