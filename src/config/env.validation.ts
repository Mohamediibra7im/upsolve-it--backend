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
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  CODEFORCES_API_BASE: z.string().url().default('https://codeforces.com/api'),
  NOTIFICATION_EMAIL: z.string().email().optional(),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
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
    EMAIL_HOST: config.get<string>('EMAIL_HOST'),
    EMAIL_PORT: config.get<string>('EMAIL_PORT'),
    EMAIL_USER: config.get<string>('EMAIL_USER'),
    EMAIL_PASS: config.get<string>('EMAIL_PASS'),
    EMAIL_FROM: config.get<string>('EMAIL_FROM'),
    CODEFORCES_API_BASE: config.get<string>('CODEFORCES_API_BASE'),
    NOTIFICATION_EMAIL: config.get<string>('NOTIFICATION_EMAIL'),
    REDIS_URL: config.get<string>('REDIS_URL'),
    RATE_LIMIT_WINDOW_MS: config.get<string>('RATE_LIMIT_WINDOW_MS'),
    RATE_LIMIT_MAX_REQUESTS: config.get<string>('RATE_LIMIT_MAX_REQUESTS'),
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
