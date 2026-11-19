import { z } from 'zod';

export const saveParkingBodySchema = z.object({
  providerPlaceId: z.string().trim().min(1, 'providerPlaceId is required'),
  provider: z.string().trim().default('google'),
});

export const savedParkingIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Saved parking id is required'),
});

export const createRecentSearchBodySchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(100).max(20000).default(3000),
  originType: z.enum(['currentLocation', 'selectedMapArea', 'destination', 'explicitAreaSearch']).default('explicitAreaSearch'),
  providerPlaceId: z.string().trim().optional(),
  destinationLabel: z.string().trim().optional(),
});

export const recentSearchIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Recent search id is required'),
});

export const updatePreferencesBodySchema = z.object({
  recentSearchEnabled: z.boolean().optional(),
  defaultRadiusMeters: z.number().int().min(500).max(10000).optional(),
});
