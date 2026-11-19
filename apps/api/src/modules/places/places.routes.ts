import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PlacesController } from './places.controller';

export interface PlacesRouteOptions extends FastifyPluginOptions {
  controller: PlacesController;
}

export async function placesRoutes(
  app: FastifyInstance,
  options: PlacesRouteOptions,
): Promise<void> {
  const { controller } = options;

  app.post(
    '/autocomplete',
    {
      config: {
        rateLimit: {
          max: 120, // Autocomplete rate limit for interactive typing
          timeWindow: '1 minute',
        },
      },
    },
    controller.getAutocomplete,
  );

  app.post(
    '/resolve',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.resolveDestination,
  );
}
