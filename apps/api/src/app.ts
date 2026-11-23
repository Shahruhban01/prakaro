import { applyAux,reconcileStaleAttendance } from './modules/moderation/attendance';
import { drainQaSamples } from './modules/moderation/qa/sampling';
import { drainWorkforceAlerts } from './modules/moderation/operations/alerts';
import { workforceRoutes } from './modules/moderation/workforce';
import { moderationRoutes } from './modules/moderation/routes';
import Fastify, { LogController, type FastifyError, FastifyInstance, FastifyServerOptions } from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from './config/env';
import { auth, moderatorAuth, superAdminAuth } from './config/auth';
import { AppError } from './common/errors/app-error';
import { replyToPoolTimeout } from './common/errors/database-unavailable';
import { prisma } from './common/database/prisma';
import { ZodError } from 'zod';
import { GooglePlacesClient } from './integrations/google-places/google-places.client';
import { ParkingService } from './modules/parking/parking.service';
import { DiscoveryIntelligence, discoveryIntelligenceOptions } from './modules/intelligence/intelligence.discovery';
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
  parkingIntelligence?: DiscoveryIntelligence;
  readinessCheck?: () => Promise<unknown>;
  maxConcurrentReports?: number;
}

const authRequestClass = (method: string, url: string) => {
  if (method !== 'POST') return 'read';
  const operation = url.split('?', 1)[0]?.split('/').at(-1);
  if (operation === 'request-password-reset' || operation === 'reset-password') return 'recovery';
  return operation === 'sign-out' || operation === 'get-session' ? 'session' : 'credential';
};
const authProductionLimit = { read: 120, recovery: 5, session: 30, credential: 10 };

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const { googlePlacesClient: customGooglePlacesClient, parkingDiscoveryObserver, parkingIntelligence,
    readinessCheck = () => prisma.$queryRaw`SELECT 1`,
    maxConcurrentReports = env.NODE_ENV === 'production' ? env.REPORT_MAX_CONCURRENT : 0,
    ...fastifyOpts } = opts;
  const authOrigin = new URL(env.BETTER_AUTH_URL).origin;
  const consoleOrigin = new URL(env.MODERATION_ORIGIN).origin;

  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : 'info' },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    trustProxy: env.TRUSTED_PROXY_CIDRS.split(',').map((value) => value.trim()).filter(Boolean),
    bodyLimit: 262_144,
    ...fastifyOpts,
  });

  if (maxConcurrentReports > 0) {
    let active = 0;
    app.addHook('onRoute', (route) => {
      if (route.method !== 'GET' || !/^\/api\/v1\/(?:moderation\/(?:analytics\/|executive\/|qa\/(?:dashboard|reviews)$|reports\/export$)|workforce\/(?:capacity|forecast)$)/.test(route.url)) return;
      const handler = route.handler;
      route.handler = async function (request, reply) {
        if (active >= maxConcurrentReports) {
          return reply.header('Retry-After', '5').code(503).send({
            error: { code: 'REPORT_BUSY', message: 'Reports are busy. Try again shortly.' },
          });
        }
        active += 1;
        try { return await handler.call(this, request, reply); }
        finally { active -= 1; }
      };
    });
  }

  // Attach correlation ID header to every response
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.NODE_ENV === 'production') reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (request.url.startsWith('/api/') && !request.url.startsWith('/api/v1/parking/')) {
      reply.header('Cache-Control', 'no-store');
    }
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ event: 'http.response', route: request.routeOptions.url ?? 'unmatched',
      method: request.method, status: reply.statusCode, durationMs: reply.elapsedTime }, 'Request completed');
  });

  // Sensible CORS configuration
  app.register(cors, {
    origin: [...new Set([authOrigin, consoleOrigin])],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Prakaro-Console', 'X-Prakaro-Search'],
    exposedHeaders: ['X-Request-Id'],
  });

  if (env.NODE_ENV === 'production') {
    app.addHook('onRoute', (route) => {
      if (route.config?.rateLimit || !route.url.startsWith('/api/v1/')) return;
      const method = Array.isArray(route.method) ? route.method[0] : route.method;
      let limit: number | undefined;
      if (method === 'GET' && /\/(analytics|executive|qa\/dashboard|workforce\/live)(\/|$)/.test(route.url)) limit = 180;
      if (method === 'POST' && /\/(?:queues\/:id\/(?:moderate(?:\/start)?|sessions)|sessions\/:id\/next)$/.test(route.url)) limit = 40;
      if (method === 'POST' && /\/(?:submit|submit-and-leave)$/.test(route.url)) limit = 40;
      if (method === 'POST' && /\/qa\//.test(route.url)) limit = 40;
      if (method === 'POST' && /\/policies\/.*\/(?:publish|rollback)$/.test(route.url)) limit = 10;
      if (limit) route.config = { ...route.config, rateLimit: { max: limit, timeWindow: '1 minute' } };
    });
  }

  // Register Better Auth handler for each isolated identity boundary
  const registerAuthEndpoint = (scope: FastifyInstance, pathPrefix: string, authInstance: { handler: (request: Request) => Promise<Response> }) => {
    scope.route({
      method: ['GET', 'POST'],
      url: `${pathPrefix}/*`,
      config: { rateLimit: {
        max: (request) => {
          const kind = authRequestClass(request.method, request.url);
          return env.NODE_ENV === 'production' || kind === 'read' ? authProductionLimit[kind] : 60;
        },
        keyGenerator: (request) => request.ip + ':' + authRequestClass(request.method, request.url),
        timeWindow: '1 minute',
      } },
      bodyLimit: 16_384,
      async handler(request, reply) {
        try {
          const url = new URL(request.url, authOrigin);
          if (url.origin !== authOrigin) return reply.code(400).send({ error: { code: 'INVALID_AUTH_URL', message: 'Invalid authentication request.' } });

          const headers = fromNodeHeaders(request.headers);
          for (const name of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip']) headers.delete(name);
          headers.set('host', url.host);
          headers.set('x-prakaro-client-ip', request.ip);

          const req = new Request(url.toString(), {
            method: request.method,
            headers,
            ...(request.body && request.method !== 'GET'
              ? { body: JSON.stringify(request.body) }
              : {}),
          });

          const moderatorRequest=pathPrefix==='/api/moderator-auth'&&request.method==='POST';
          if(pathPrefix!=='/api/auth'&&request.method==='POST'&&url.pathname===pathPrefix+'/sign-out'){
            const origin=request.headers.origin;
            if(origin ? origin!==consoleOrigin||request.headers['x-prakaro-console']!=='1' : !request.headers.authorization?.startsWith('Bearer ')&&Boolean(request.headers.cookie)){
              return reply.status(403).send({error:{code:'FORBIDDEN',message:'Invalid console origin.'}});
            }
            const current=moderatorRequest ? await moderatorAuth.api.getSession({headers,query:{disableCookieCache:true}}) : null;
            if(current){
              try{await applyAux({moderatorId:current.user.id,authSessionId:current.session.id},{type:'LOGOUT'});}
              catch(error){if(!(error instanceof AppError)||error.statusCode!==401&&error.statusCode!==403)throw error;}
            }
          }
          const response = await authInstance.handler(req);
          if(moderatorRequest&&url.pathname===pathPrefix+'/sign-in/email'&&response.ok){
            const body:unknown=await response.clone().json();
            if(body&&typeof body==='object'&&'token' in body&&typeof body.token==='string'){
              const session=await moderatorAuth.api.getSession({headers:new Headers({authorization:'Bearer '+body.token}),query:{disableCookieCache:true}});
              if(session)try{
                await applyAux({moderatorId:session.user.id,authSessionId:session.session.id},{type:'START'});
              }catch(error){
                // The existing authentication domain remains usable for read-only access.
                // The attendance endpoint reports eligibility, device conflicts and persistence failures.
                if(!(error instanceof AppError))request.log.warn('Attendance could not start after sign-in');
              }
            }
          }

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

          response.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() !== 'set-cookie') {
              reply.header(key, value);
            }
          });

          const data = await response.text();
          return reply.send(data);
        } catch (error) {
          if (replyToPoolTimeout(error, request, reply)) return reply;
          if(error instanceof AppError)return reply.status(error.statusCode).send({error:{code:error.code,message:error.message}});
          request.log.error({errorName:error instanceof Error?error.name:'Unknown'},'Authentication request failed');
          return reply.status(500).send({
            error: {
              code: 'AUTH_PROCESSING_ERROR',
              message: 'An error occurred while processing authentication.',
            },
          });
        }
      },
    });
  };

  // Basic endpoint rate limiting
  app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 100 : 5000,
    timeWindow: '1 minute',
    errorResponseBuilder: () =>
      new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.'),
  });
  app.register(async (scope) => {
    registerAuthEndpoint(scope, '/api/auth', auth);
    registerAuthEndpoint(scope, '/api/moderator-auth', moderatorAuth);
    registerAuthEndpoint(scope, '/api/super-admin-auth', superAdminAuth);
  });

  if(env.NODE_ENV!=='test'){
    let alerts: Promise<void> | undefined;
    const alertTimer = setInterval(() => {
      if (!alerts) alerts = drainWorkforceAlerts().then(() => undefined)
        .catch(() => { app.log.warn({ event: 'worker.workforce_alerts.failure' }, 'Workforce alert evaluation could not finish'); })
        .finally(() => { alerts = undefined; });
    }, 15000);
    alertTimer.unref();
    app.addHook('onClose', async () => { clearInterval(alertTimer); await alerts; });
    let sampling: Promise<void> | undefined;
    const worker = setInterval(() => {
      if (!sampling) sampling = drainQaSamples()
        .then(() => undefined)
        .catch(() => { app.log.warn({ event: 'worker.qa_sampling.failure' }, 'QA sampling could not finish its current batch'); })
        .finally(() => { sampling = undefined; });
    }, 3000);
    worker.unref();
    app.addHook('onClose', async () => { clearInterval(worker); await sampling; });
    let reconciliation:Promise<void>|undefined;
    const sweep=setInterval(()=>{
      if(!reconciliation)reconciliation=reconcileStaleAttendance()
        .catch(() => app.log.warn({ event: 'worker.attendance_reconciliation.failure' }, 'Attendance reconciliation failed'))
        .finally(()=>{reconciliation=undefined;});
    },60_000);
    sweep.unref();
    app.addHook('onClose',async()=>{clearInterval(sweep);await reconciliation;});
  }
  app.register(workforceRoutes,{prefix:'/api/v1'});
  app.register(moderationRoutes,{prefix:'/api/v1/moderation'});
  // Health endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'prakaro-api',
    };
  });
  let probe: Promise<boolean> | undefined;
  app.get('/ready', async (_request, reply) => {
    probe ??= Promise.resolve().then(readinessCheck).then(() => true, () => false)
      .finally(() => { probe = undefined; });
    let timer: NodeJS.Timeout | undefined;
    const ready = await Promise.race([probe, new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), 1500);
    })]).finally(() => clearTimeout(timer));
    return reply.header('Cache-Control', 'no-store').code(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'unavailable' });
  });

  // Parking module dependency wiring
  const googlePlacesClient =
    customGooglePlacesClient ?? new GooglePlacesClient(env.GOOGLE_PLACES_API_KEY);
  const parkingService = new ParkingService(googlePlacesClient, parkingDiscoveryObserver ??
    createDiscoveryObserver(() => app.log.warn('Parking intelligence shadow evaluation failed')),
    parkingIntelligence ?? new DiscoveryIntelligence(discoveryIntelligenceOptions));
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
  app.setErrorHandler((error, request, reply) => {
    if (replyToPoolTimeout(error, request, reply)) return reply;
    const detail: Partial<FastifyError> = error instanceof Error ? error : {};
    const status = detail.statusCode ?? 500;
    if (!(error instanceof ZodError) && status >= 500) {
      request.log.error({ event: 'http.failure', route: request.routeOptions.url, errorName: detail.name }, 'Request failed');
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Invalid request parameters.' } });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (detail.validation) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_QUERY_PARAMS',
          message: 'Invalid request parameters.',
        },
      });
    }

    if (status === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      });
    }

    const statusCode = status >= 400 && status < 600 ? status : 500;

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : detail.code ?? 'INVALID_REQUEST',
        message: statusCode >= 500 ? 'An unexpected internal error occurred.' : 'The request could not be processed.',
      },
    });
  });

  return app;
}
