import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from './config/env';
import { auth } from './config/auth';
import { AppError } from './common/errors/app-error';
import { GooglePlacesClient } from './integrations/google-places/google-places.client';
import { ParkingService } from './modules/parking/parking.service';
import { ParkingController } from './modules/parking/parking.controller';
import { parkingRoutes } from './modules/parking/parking.routes';
import { ParkingPhotosService } from './modules/parking/photos/parking-photos.service';
import { ParkingPhotosController } from './modules/parking/photos/parking-photos.controller';
import { parkingPhotosRoutes } from './modules/parking/photos/parking-photos.routes';
import { UserService } from './modules/user/user.service';
import { UserController } from './modules/user/user.controller';
import { userRoutes } from './modules/user/user.routes';
import { PlacesService } from './modules/places/places.service';
import { PlacesController } from './modules/places/places.controller';
import { placesRoutes } from './modules/places/places.routes';
import { createDiscoveryObserver, type DiscoveryObserver } from './modules/intelligence/intelligence.shadow';

export interface AppOptions extends FastifyServerOptions {
  googlePlacesClient?: GooglePlacesClient;
  parkingDiscoveryObserver?: DiscoveryObserver;
}

function maskSensitiveUrl(url: string): string {
  // Mask coordinates to 2 decimal places to prevent logging precise user coordinates
  return url.replace(/([?&](?:latitude|longitude)=)(-?\d+\.\d{2})\d*/gi, '$1$2***');
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const { googlePlacesClient: customGooglePlacesClient, parkingDiscoveryObserver, ...fastifyOpts } = opts;

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
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Cookie'],
    exposedHeaders: ['X-Request-Id', 'Set-Cookie'],
  });

  // Better Auth Catch-All Handler (/api/auth/*)
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      try {
        const protocol = request.headers['x-forwarded-proto'] || 'http';
        const host = request.headers.host || 'localhost:3000';
        const url = new URL(request.url, `${protocol}://${host}`);

        const headers = fromNodeHeaders(request.headers);

        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body && request.method !== 'GET'
            ? { body: JSON.stringify(request.body) }
            : {}),
        });

        const response = await auth.handler(req);

        reply.status(response.status);

        // Forward Set-Cookie headers properly
        const getSetCookie = (
          response.headers as unknown as { getSetCookie?: () => string[] }
        ).getSetCookie;
        if (typeof getSetCookie === 'function') {
          const cookies = getSetCookie.call(response.headers);
          if (cookies && cookies.length > 0) {
            reply.header('set-cookie', cookies);
          }
        }

        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'set-cookie') {
            reply.header(key, value);
          }
        });

        const data = await response.text();
        return reply.send(data);
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          error: {
            code: 'AUTH_PROCESSING_ERROR',
            message: 'An error occurred while processing authentication.',
          },
        });
      }
    },
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
  const parkingService = new ParkingService(googlePlacesClient, parkingDiscoveryObserver ??
    createDiscoveryObserver(() => app.log.warn('Parking intelligence shadow evaluation failed')));
  const parkingController = new ParkingController(parkingService);

  const parkingPhotosService = new ParkingPhotosService(googlePlacesClient);
  const parkingPhotosController = new ParkingPhotosController(parkingPhotosService);

  // Register parking photo routes first (more specific subpaths)
  app.register(parkingPhotosRoutes, {
    prefix: '/api/v1/parking',
    controller: parkingPhotosController,
  });

  // Register parking routes
  app.register(parkingRoutes, {
    prefix: '/api/v1/parking',
    controller: parkingController,
  });

  // User module wiring (Cloud Sync)
  const userService = new UserService();
  const userController = new UserController(userService);
  app.register(userRoutes, {
    prefix: '/api/v1/users',
    controller: userController,
  });

  // Places module wiring (Destination Autocomplete & Resolve)
  const placesService = new PlacesService(googlePlacesClient);
  const placesController = new PlacesController(placesService);
  app.register(placesRoutes, {
    prefix: '/api/v1/places',
    controller: placesController,
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
