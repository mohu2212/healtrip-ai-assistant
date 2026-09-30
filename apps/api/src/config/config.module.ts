import { Global, Module } from '@nestjs/common';
import { AppConfig, loadEnv } from './env.schema.js';

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => loadEnv(process.env) }],
  exports: [AppConfig],
})
export class ConfigModule {}
