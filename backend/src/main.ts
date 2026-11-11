import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getAllowedOrigins, isAllowedOrigin } from './common/allowed-origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Set trust proxy to 1 for correct IP resolution behind reverse proxy (Nginx/Cloudflare)
  app.set('trust proxy', 1);
  // Enhance security with HTTP headers
  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
    console.warn(
      'FRONTEND_URL chưa được cấu hình: mọi request từ trình duyệt sẽ bị CORS chặn',
    );
  }
  console.log(`CORS origins: ${getAllowedOrigins().join(', ') || '(none)'}`);
  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  // Bind to localhost (127.0.0.1) to prevent direct external access bypassing the proxy
  await app.listen(port, '127.0.0.1');
  console.log(`Server đang chạy trên: http://127.0.0.1:${port}`);
}
void bootstrap();
