import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { TYPEORM_ENTITIES } from './typeorm.entities';

export function typeOrmDataSourceOptions(): DataSourceOptions {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const migrationExt = __filename.endsWith('.js') ? 'js' : 'ts';
  const base: DataSourceOptions = {
    type: 'postgres',
    entities: TYPEORM_ENTITIES,
    migrations: [join(__dirname, 'migrations', `*.${migrationExt}`)],
    synchronize: false,
    migrationsRun: false,
  };
  if (databaseUrl) {
    return {
      ...base,
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    ...base,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'baghub',
    password: process.env.DB_PASSWORD ?? 'baghub',
    database: process.env.DB_DATABASE ?? 'baghub',
  };
}
