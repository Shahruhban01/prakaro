import { FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from '../../common/middleware/auth.middleware';
import { ValidationError } from '../../common/errors/app-error';
import {
  createRecentSearchBodySchema,
  recentSearchIdParamSchema,
  savedParkingIdParamSchema,
  saveParkingBodySchema,
  updatePreferencesBodySchema,
} from './user.schemas';
import { UserService } from './user.service';

export class UserController {
  constructor(private readonly userService: UserService) {}

  public getSavedParking = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const result = await this.userService.getSavedParking(user.id);
    return reply.status(200).send(result);
  };

  public saveParking = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const parsed = saveParkingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.userService.saveParking(user.id, parsed.data);
    return reply.status(201).send(result);
  };

  public deleteSavedParking = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const parsed = savedParkingIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.userService.deleteSavedParking(user.id, parsed.data.id);
    return reply.status(200).send(result);
  };

  public getRecentSearches = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const result = await this.userService.getRecentSearches(user.id);
    return reply.status(200).send(result);
  };

  public createRecentSearch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const parsed = createRecentSearchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.userService.createRecentSearch(user.id, parsed.data);
    return reply.status(201).send(result);
  };

  public deleteRecentSearch = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const parsed = recentSearchIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.userService.deleteRecentSearch(user.id, parsed.data.id);
    return reply.status(200).send(result);
  };

  public clearRecentSearches = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const result = await this.userService.clearRecentSearches(user.id);
    return reply.status(200).send(result);
  };

  public getPreferences = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const result = await this.userService.getPreferences(user.id);
    return reply.status(200).send(result);
  };

  public updatePreferences = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const parsed = updatePreferencesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(' '));
    }

    const result = await this.userService.updatePreferences(user.id, parsed.data);
    return reply.status(200).send(result);
  };

  public deleteAccount = async (req: FastifyRequest, reply: FastifyReply) => {
    const { user } = await requireAuth(req, reply);
    const result = await this.userService.deleteAccount(user.id);
    return reply.status(200).send(result);
  };
}
