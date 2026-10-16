import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  it('POST /users should return 404 Not Found (FULLAUDIT-001 route removed)', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({
        username: 'malicious',
        email: 'malicious@example.com',
        password: 'plaintextpassword',
      })
      .expect(404);
  });

  it('GET /users without JWT should return 401 Unauthorized', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('GET /users/profile without JWT should return 401 Unauthorized', () => {
    return request(app.getHttpServer()).get('/users/profile').expect(401);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);
});
