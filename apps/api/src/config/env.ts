import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('mysql://root:@localhost:3306/prakaro_db'),
  BETTER_AUTH_SECRET: z.string().default('prakaro_dev_secret_auth_key_super_secure_32_chars_min'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GOOGLE_GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9][a-z0-9.-]*$/)
    .default('gemini-3.5-flash-lite'),
  GOOGLE_GEMINI_MODEL: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9][a-z0-9.-]*$/)
    .default('gemini-3.5-flash-lite'),
  AI_PROVIDER_PRIORITY: z.string().default('google,openrouter'),
  OPENROUTER_API_KEY: z.string().trim().optional(),
  OPENROUTER_MODEL: z.string().trim().default('meta-llama/llama-3.3-70b-instruct:free'),
  AI_ENABLE_PROVIDER_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AI_ALLOW_PAID_MODELS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MODERATION_INTAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MODERATION_DAILY_CASE_LIMIT: z.coerce.number().int().min(1).default(50),
  AUX_PRESENCE_STALE_SECONDS: z.coerce.number().int().min(60).max(300).default(90),
  AUX_INACTIVITY_SECONDS: z.coerce.number().int().min(360).max(3600).default(900),
  MODERATION_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  REPORT_MAX_CONCURRENT: z.coerce.number().int().min(1).max(20).default(2),
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
}).superRefine((config, ctx) => {
  if (config.NODE_ENV !== 'production') return;
  for (const field of ['BETTER_AUTH_URL', 'MODERATION_ORIGIN'] as const) {
    const url = URL.canParse(config[field]) ? new URL(config[field]) : null;
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Production requires an HTTPS origin.' });
    }
  }
  if (config.BETTER_AUTH_SECRET.length < 32 || config.BETTER_AUTH_SECRET.startsWith('prakaro_dev_secret')) {
    ctx.addIssue({ code: 'custom', path: ['BETTER_AUTH_SECRET'], message: 'Supply a dedicated production signing secret.' });
  }
  const database = URL.canParse(config.DATABASE_URL) ? new URL(config.DATABASE_URL) : null;
  if (!database || database.protocol !== 'mysql:' || !database.password || !database.username || database.username === 'root') {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Supply credentials for a dedicated MySQL account.' });
  }
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
