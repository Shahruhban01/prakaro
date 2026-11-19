import { FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../common/errors/app-error';
import { nearbyParkingQuerySchema } from './parking.schemas';
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
}
