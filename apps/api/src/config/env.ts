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
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9][a-z0-9.-]*$/)
    .default('gemini-2.5-flash-lite'),
  AI_VERIFICATION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AI_SHADOW_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AI_MAX_CALLS_PER_DAY: z.coerce.number().int().nonnegative().max(100_000).default(50),
  AI_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(10).default(2),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(15_000).default(4000),
  PARKING_INTELLIGENCE_DISPLAY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PARKING_INTELLIGENCE_FILTERING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PARKING_INTELLIGENCE_DEFAULT_MODE: z
    .enum(['ALL_CANDIDATES', 'RECOMMENDED', 'VERIFIED_ONLY'])
    .default('ALL_CANDIDATES'),
  PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  PARKING_REVIEW_ADMIN_IDS: z.string().default(''),
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
