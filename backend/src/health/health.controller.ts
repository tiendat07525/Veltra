import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HealthService } from './health.service';

// Public on purpose (deploy.sh, healthcheck timer, external uptime monitor): it reveals only
// whether MongoDB and Redis answer. Listed in PUBLIC_ROUTES (test/route-guards.spec.ts).
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async check() {
    const report = await this.healthService.check();
    if (report.status !== 'ok') {
      // 503 with the same body, so monitors can tell which store is down
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
