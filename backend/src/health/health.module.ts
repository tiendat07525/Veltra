import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
