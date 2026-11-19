import { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { facilityIdParamSchema, nearbyParkingQuerySchema } from './parking.schemas';
import { ParkingService } from './parking.service';

export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  public getNearbyParking = async (
    req: FastifyRequest<{ Querystring: Record<string, unknown> }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const parsed = nearbyParkingQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ValidationError(message || 'Invalid query parameters.');
    }

    const result = await this.parkingService.findNearby(parsed.data);
    return reply.status(200).send(result);
  };

  public getParkingDetails = async (
    req: FastifyRequest<{ Params: Record<string, unknown> }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const parsed = facilityIdParamSchema.safeParse(req.params);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(' ');
      throw new ValidationError(message || 'Invalid facility ID.');
    }

    const facility = await this.parkingService.getFacilityDetails(parsed.data.id);

    if (!facility) {
      throw new NotFoundError(`Parking facility '${parsed.data.id}' was not found.`);
    }

    return reply.status(200).send({ data: facility });
  };
}
