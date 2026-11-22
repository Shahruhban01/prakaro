import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { prisma } from '../common/database/prisma';
import { env } from './env';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    ...(process.env.MODERATION_ORIGIN ? [new URL(process.env.MODERATION_ORIGIN).origin] : []),
    env.BETTER_AUTH_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.0.2.2:3000',
  ],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    bearer(),
  ],
});
