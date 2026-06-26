/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Response } from 'express';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should redirect to /docs', () => {
      const redirectMock = jest.fn();
      const res = { redirect: redirectMock } as unknown as Response;
      appController.getHello(res);
      expect(redirectMock).toHaveBeenCalledWith('/docs');
    });
  });
});
