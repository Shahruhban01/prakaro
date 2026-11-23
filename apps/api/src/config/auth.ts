import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { prisma } from '../common/database/prisma';
import { env } from './env';

export const trustedOrigins = [
  ...(process.env.MODERATION_ORIGIN ? [new URL(process.env.MODERATION_ORIGIN).origin] : []),
  new URL(env.BETTER_AUTH_URL).origin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.2:3000',
];

export function isAllowedConsoleOrigin(origin?: string): boolean {
  if (!origin) return false;
  return trustedOrigins.includes(origin);
}

const sessionCookie = {
  useSecureCookies: env.NODE_ENV === 'production' || env.BETTER_AUTH_URL.startsWith('https:'),
  ipAddress: { ipAddressHeaders: ['x-prakaro-client-ip'] },
};

// 1. Ordinary Mobile Users Auth (/api/auth)
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    ...sessionCookie,
    cookiePrefix: 'prakaro_user',
  },
  plugins: [bearer()],
});

// 2. Moderation Staff & Moderation Admins Auth (/api/moderator-auth)
export const moderatorAuth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  user: {
    modelName: 'moderator',
  },
  session: {
    modelName: 'moderatorSession',
  },
  account: {
    modelName: 'moderatorAccount',
  },
  verification: {
    modelName: 'moderatorVerification',
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/moderator-auth',
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Disallow public self-registration
  },
  advanced: {
    ...sessionCookie,
    cookiePrefix: 'prakaro_moderator',
  },
  plugins: [bearer()],
});

// 3. Platform Super Admins Auth (/api/super-admin-auth)
export const superAdminAuth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  user: {
    modelName: 'superAdmin',
  },
  session: {
    modelName: 'superAdminSession',
  },
  account: {
    modelName: 'superAdminAccount',
  },
  verification: {
    modelName: 'superAdminVerification',
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/super-admin-auth',
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Disallow public self-registration
  },
  advanced: {
    ...sessionCookie,
    cookiePrefix: 'prakaro_super_admin',
  },
  plugins: [bearer()],
});
