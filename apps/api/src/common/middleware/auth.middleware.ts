import { FastifyRequest, FastifyReply } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../config/auth';
import { UnauthorizedError } from '../errors/app-error';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedSession {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
}

export interface AuthContext {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
}

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<AuthContext> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session || !session.user || !session.session) {
    throw new UnauthorizedError('Authentication required to access this resource.');
  }

  return {
    user: session.user as AuthenticatedUser,
    session: session.session as AuthenticatedSession,
  };
}
