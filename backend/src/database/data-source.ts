import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadLocalEnv } from './load-local-env';
import { typeOrmDataSourceOptions } from './typeorm.options';

loadLocalEnv();

export default new DataSource(typeOrmDataSourceOptions());
