import { z } from 'zod';
import { ConfigService } from '@nestjs/config';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3001'),
  APP_URL: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  MONGODB_URI_DEV: z.string().optional(),
  MONGODB_URI_PROD: z.string().optional(),
  MONGO_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  // SMTP (contact/support email). Names must match what ContactService reads.
  SMTP_EMAIL: z.string().email().optional(),
  SMTP_PASSWORD: z.string().optional(),
  CODEFORCES_API_BASE: z.string().url().default('https://codeforces.com/api'),
  CODEFORCES_API_KEY: z.string().optional(),
  CODEFORCES_API_SECRET: z.string().optional(),
  NOTIFICATION_EMAIL: z.string().email().optional(),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  // Optional basic-auth gate for the /docs Swagger page. Set both to require
  // credentials; leave unset to serve docs openly.
  SWAGGER_USER: z.string().optional(),
  SWAGGER_PASSWORD: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function validateEnv(config: ConfigService): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configObject = {
    NODE_ENV: config.get<string>('NODE_ENV'),
    PORT: config.get<string>('PORT'),
    FRONTEND_ORIGIN: config.get<string>('FRONTEND_ORIGIN'),
    APP_URL: config.get<string>('APP_URL'),
    MONGODB_URI: config.get<string>('MONGODB_URI'),
    MONGODB_URI_DEV: config.get<string>('MONGODB_URI_DEV'),
    MONGODB_URI_PROD: config.get<string>('MONGODB_URI_PROD'),
    MONGO_URL: config.get<string>('MONGO_URL'),
    JWT_SECRET: config.get<string>('JWT_SECRET'),
    JWT_REFRESH_SECRET: config.get<string>('JWT_REFRESH_SECRET'),
    JWT_EXPIRATION: config.get<string>('JWT_EXPIRATION'),
    JWT_REFRESH_EXPIRATION: config.get<string>('JWT_REFRESH_EXPIRATION'),
    LOG_LEVEL: config.get<string>('LOG_LEVEL'),
    SMTP_EMAIL: config.get<string>('SMTP_EMAIL'),
    SMTP_PASSWORD: config.get<string>('SMTP_PASSWORD'),
    CODEFORCES_API_BASE: config.get<string>('CODEFORCES_API_BASE'),
    CODEFORCES_API_KEY: config.get<string>('CODEFORCES_API_KEY'),
    CODEFORCES_API_SECRET: config.get<string>('CODEFORCES_API_SECRET'),
    NOTIFICATION_EMAIL: config.get<string>('NOTIFICATION_EMAIL'),
    REDIS_URL: config.get<string>('REDIS_URL'),
    RATE_LIMIT_WINDOW_MS: config.get<string>('RATE_LIMIT_WINDOW_MS'),
    RATE_LIMIT_MAX_REQUESTS: config.get<string>('RATE_LIMIT_MAX_REQUESTS'),
    SWAGGER_USER: config.get<string>('SWAGGER_USER'),
    SWAGGER_PASSWORD: config.get<string>('SWAGGER_PASSWORD'),
  };

  const result = envSchema.safeParse(configObject);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    throw new Error('Environment not validated yet. Call validateEnv() first.');
  }
  return cachedConfig;
}
