import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function replyToPoolTimeout(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2024') return false;
  request.log.warn({ event: 'db.pool.timeout', route: request.routeOptions.url }, 'Database connection pool timeout');
  reply.header('Retry-After', '5').code(503).send({
    error: { code: 'DATABASE_BUSY', message: 'The database is busy. Try again shortly.' },
  });
  return true;
}
