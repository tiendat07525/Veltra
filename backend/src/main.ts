import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    }));

  const allowedOrigins = ["http://localhost:3000", "https://tiendat75.id.vn", "http://tiendat75.id.vn"] 
  app.enableCors({
    origin: (origin, callback)=>{
      if(!origin || allowedOrigins.includes(origin)){
        callback(null, true);
      } else{
        callback(new Error('Blocked by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`Server đang chạy trên: http://0.0.0.0:${port}`)
}
bootstrap();
