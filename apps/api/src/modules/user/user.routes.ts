import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { UserController } from './user.controller';

export interface UserRouteOptions extends FastifyPluginOptions {
  controller: UserController;
}

export async function userRoutes(
  app: FastifyInstance,
  options: UserRouteOptions,
): Promise<void> {
  const { controller } = options;

  // Saved Parking Endpoints
  app.get('/me/saved-parking', controller.getSavedParking);
  app.post('/me/saved-parking', controller.saveParking);
  app.delete('/me/saved-parking/:id', controller.deleteSavedParking);

  // Recent Searches Endpoints
  app.get('/me/recent-searches', controller.getRecentSearches);
  app.post('/me/recent-searches', controller.createRecentSearch);
  app.delete('/me/recent-searches/:id', controller.deleteRecentSearch);
  app.delete('/me/recent-searches', controller.clearRecentSearches);

  // User Preferences Endpoints
  app.get('/me/preferences', controller.getPreferences);
  app.patch('/me/preferences', controller.updatePreferences);

  // Account Deletion Endpoint
  app.delete('/me', controller.deleteAccount);
}
