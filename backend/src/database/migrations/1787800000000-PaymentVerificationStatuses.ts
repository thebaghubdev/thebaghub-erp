import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentVerificationStatuses1787800000000
  implements MigrationInterface
{
  name = 'PaymentVerificationStatuses1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD "pullout_payment_status" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD "third_party_payment_status" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "walk_in_authentications" ADD "payment_status" character varying(32) NOT NULL DEFAULT 'For payment verification'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "reservation_payment_status" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD "walk_in_authentication_id" uuid`,
    );

    await queryRunner.query(`
      UPDATE "walk_in_authentications"
      SET "payment_status" = 'Confirmed'
    `);

    await queryRunner.query(`
      UPDATE "inquiries"
      SET "pullout_payment_status" = 'Confirmed'
      WHERE "pullout_fee" IS NOT NULL
        AND "status" IN ('for_pullout', 'for_pullout_scheduled', 'pulled_out')
    `);

    await queryRunner.query(`
      UPDATE "inquiries"
      SET "third_party_payment_status" = 'Confirmed'
      WHERE "status" = 'authenticated_for_3rd_party'
    `);

    await queryRunner.query(`
      UPDATE "inquiries"
      SET "third_party_payment_status" = 'For payment verification'
      WHERE "status" = 'authenticated_requested_for_reauthentication'
        AND EXISTS (
          SELECT 1 FROM "media" m
          WHERE m."owner_id" = "inquiries"."id"
            AND m."owner_type" = 'inquiry'
            AND m."purpose" = 'third_party_payment'
        )
    `);

    await queryRunner.query(`
      UPDATE "orders"
      SET "reservation_payment_status" = 'Confirmed'
      WHERE "reservation_payment_proof_uploaded_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "walk_in_authentication_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "reservation_payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "walk_in_authentications" DROP COLUMN "payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP COLUMN "third_party_payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP COLUMN "pullout_payment_status"`,
    );
  }
}
