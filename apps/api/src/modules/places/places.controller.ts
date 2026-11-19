import { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import {
  autocompleteBodySchema,
  resolveDestinationBodySchema,
} from './places.schemas';
import { PlacesService } from './places.service';

export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  public getAutocomplete = async (
    req: FastifyRequest<{ Body: Record<string, unknown> }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const parsed = autocompleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.placesService.getAutocompleteSuggestions(
      parsed.data.input,
      parsed.data.sessionToken,
    );
    return reply.status(200).send({
      data: result.data,
      meta: {
        count: result.data.length,
        sessionActive: !!parsed.data.sessionToken,
      },
    });
  };

  public resolveDestination = async (
    req: FastifyRequest<{ Body: Record<string, unknown> }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const parsed = resolveDestinationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.placesService.resolveDestination(
      parsed.data.placeId,
      parsed.data.sessionToken,
    );

    if (!result.data) {
      throw new NotFoundError(`Destination placeId '${parsed.data.placeId}' not found.`);
    }

    return reply.status(200).send({
      data: result.data,
      meta: {
        sessionConcluded: !!parsed.data.sessionToken,
      },
    });
  };
}
