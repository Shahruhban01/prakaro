import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { ValidationError } from '../../../common/errors/app-error';
import {
  facilityIdParamSchema,
  photoMediaParamsSchema,
  photoMediaQuerySchema,
} from './parking-photos.schemas';
import { ParkingPhotosService } from './parking-photos.service';

export class ParkingPhotosController {
  constructor(private readonly parkingPhotosService: ParkingPhotosService) {}

  public getPhotos = async (
    req: FastifyRequest<{ Params: Record<string, unknown> }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const parsed = facilityIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ValidationError(message || 'Invalid facility ID.');
    }

    const result = await this.parkingPhotosService.getFacilityPhotos(parsed.data.id);
    return reply.status(200).send(result);
  };

  public getPhotoMedia = async (
    req: FastifyRequest<{
      Params: Record<string, unknown>;
      Querystring: Record<string, unknown>;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const paramsParsed = photoMediaParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      const message = paramsParsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ValidationError(message || 'Invalid photo parameters.');
    }

    const queryParsed = photoMediaQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      const message = queryParsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ValidationError(message || 'Invalid query parameters.');
    }

    const { body, contentType, contentLength } =
      await this.parkingPhotosService.getFacilityPhotoMedia(
        paramsParsed.data.id,
        paramsParsed.data.photoIndex,
        {
          maxWidth: queryParsed.data.maxWidth,
          maxHeight: queryParsed.data.maxHeight,
        },
      );

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    if (contentLength) {
      reply.header('Content-Length', String(contentLength));
    }

    if (!body) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Photo media content is empty.',
        },
      });
    }

    // Convert Web ReadableStream to Node.js Readable stream if necessary
    const nodeStream =
      typeof (body as { getReader?: unknown }).getReader === 'function'
        ? Readable.fromWeb(body as import('node:stream/web').ReadableStream)
        : (body as NodeJS.ReadableStream);

    return reply.send(nodeStream);
  };
}
