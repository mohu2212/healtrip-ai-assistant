import { Controller, Get } from '@nestjs/common';

// Liveness probe. A DB readiness check is added with the Prisma module.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
