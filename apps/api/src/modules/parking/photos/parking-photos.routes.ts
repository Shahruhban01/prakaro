import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ParkingPhotosController } from './parking-photos.controller';

export interface ParkingPhotosRouteOptions extends FastifyPluginOptions {
  controller: ParkingPhotosController;
}

export async function parkingPhotosRoutes(
  app: FastifyInstance,
  options: ParkingPhotosRouteOptions,
): Promise<void> {
  const { controller } = options;

  app.get(
    '/:id/photos',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.getPhotos,
  );

  app.get(
    '/:id/photos/:photoIndex/media',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    controller.getPhotoMedia,
  );

  app.get(
    '/places/:id/photos',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.getPhotos,
  );

  app.get(
    '/places/:id/photos/:photoIndex/media',
    {
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    },
    controller.getPhotoMedia,
  );
}
