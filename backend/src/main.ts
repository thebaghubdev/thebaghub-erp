import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/**
 * Must stay in sync with `MAX_ITEMS_PER_INQUIRY` in
 * `frontend/src/types/consign-inquiry.ts` (currently 10).
 *
 * With a fixed JSON body cap, max line items per form is:
 *   floor(cap / (minImagesPerItem × estimatedBytesPerImage))
 * (form metadata is comparatively tiny). Item count stays 10 by product rule;
 * the cap below is sized for that, not a lower item count.
 */
const MAX_CONSIGNMENT_INQUIRY_ITEMS = 10;

/**
 * Minimum photos per item assumed when sizing draft payloads (client consignment).
 * If this or `MAX_CONSIGNMENT_INQUIRY_ITEMS` changes, revisit the body limit.
 */
const MIN_IMAGES_PER_CONSIGNMENT_ITEM = 10;

/**
 * Conservative size of one image once embedded as a base64 data URL in JSON
 * (~1 MiB per photo after encoding overhead; tune if real uploads are larger).
 */
const DRAFT_SNAPSHOT_BYTES_PER_IMAGE_ESTIMATE = 1024 * 1024;

const DRAFT_SNAPSHOT_BUDGET_BYTES_PER_ITEM =
  MIN_IMAGES_PER_CONSIGNMENT_ITEM * DRAFT_SNAPSHOT_BYTES_PER_IMAGE_ESTIMATE;

const JSON_BODY_LIMIT =
  MAX_CONSIGNMENT_INQUIRY_ITEMS * DRAFT_SNAPSHOT_BUDGET_BYTES_PER_ITEM;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
