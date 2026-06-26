import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const { method, originalUrl, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const startTime = Date.now();

    const requestId = this.generateRequestId();
    (request as any).requestId = requestId;

    response.setHeader('X-Request-ID', requestId);

    this.logger.log(
      `[${requestId}] ${method} ${originalUrl} - ${ip} - ${userAgent}`,
    );

    const originalSend = response.send.bind(response);
    response.send = (body?: any): Response => {
      const duration = Date.now() - startTime;
      const { statusCode } = response;

      const logLevel =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

      const message = `[${requestId}] ${method} ${originalUrl} ${statusCode} ${duration}ms`;

      if (logLevel === 'error') {
        this.logger.error(message);
      } else if (logLevel === 'warn') {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }

      return originalSend(body);
    };

    next();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
