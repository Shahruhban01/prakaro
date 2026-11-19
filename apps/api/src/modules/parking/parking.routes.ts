import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ParkingController } from './parking.controller';

export interface ParkingRouteOptions extends FastifyPluginOptions {
  controller: ParkingController;
}

export async function parkingRoutes(
  app: FastifyInstance,
  options: ParkingRouteOptions,
): Promise<void> {
  const { controller } = options;

  app.get(
    '/nearby',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.getNearbyParking,
  );
}
