import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service.js';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. No dependencies — used by the hosting platform. */
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the API can serve traffic (database reachable). */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const dbUp = await this.prisma.isHealthy();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: dbUp ? 'ok' : 'degraded', checks: { database: dbUp ? 'up' : 'down' } };
  }
}
