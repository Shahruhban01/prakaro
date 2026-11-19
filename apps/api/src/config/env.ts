import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('mysql://root:@localhost:3306/prakaro_db'),
  BETTER_AUTH_SECRET: z.string().default('prakaro_dev_secret_auth_key_super_secure_32_chars_min'),
  BETTER_AUTH_URL: z.string().default('http://localhost:3000'),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env = getEnv();
