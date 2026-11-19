import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { AppError } from './common/errors/app-error';

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    ...opts,
  });

  // Sensible CORS configuration
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Health endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'prakaro-api',
    };
  });

  // Centralized error handling
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
        details: error.details,
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: error.message,
        details: error.validation,
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'InternalServerError' : error.name,
      message: statusCode >= 500 ? 'An unexpected internal error occurred' : error.message,
    });
  });

  return app;
}
