import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env';
import { AppError } from './common/errors/app-error';
import { GooglePlacesClient } from './integrations/google-places/google-places.client';
import { ParkingService } from './modules/parking/parking.service';
import { ParkingController } from './modules/parking/parking.controller';
import { parkingRoutes } from './modules/parking/parking.routes';

export interface AppOptions extends FastifyServerOptions {
  googlePlacesClient?: GooglePlacesClient;
}

function maskSensitiveUrl(url: string): string {
  // Mask coordinates to 2 decimal places to prevent logging precise user coordinates
  return url.replace(/([?&](?:latitude|longitude)=)(-?\d+\.\d{2})\d*/gi, '$1$2***');
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const { googlePlacesClient: customGooglePlacesClient, ...fastifyOpts } = opts;

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: maskSensitiveUrl(req.url),
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    ...fastifyOpts,
  });

  // Attach correlation ID header to every response
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // Sensible CORS configuration
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  // Basic endpoint rate limiting
  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    }),
  });

  // Health endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'prakaro-api',
    };
  });

  // Parking module dependency wiring
  const googlePlacesClient =
    customGooglePlacesClient ?? new GooglePlacesClient(env.GOOGLE_PLACES_API_KEY);
  const parkingService = new ParkingService(googlePlacesClient);
  const parkingController = new ParkingController(parkingService);

  // Register parking routes
  app.register(parkingRoutes, {
    prefix: '/api/v1/parking',
    controller: parkingController,
  });

  // Centralized, safe error handling
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_QUERY_PARAMS',
          message: error.message,
        },
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      });
    }

    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : error.name,
        message: statusCode >= 500 ? 'An unexpected internal error occurred.' : error.message,
      },
    });
  });

  return app;
}
