import { z } from 'zod';

export const autocompleteBodySchema = z.object({
  input: z.string().trim().min(1, 'Search input is required').max(100),
  sessionToken: z.string().trim().optional(),
});

export const resolveDestinationBodySchema = z.object({
  placeId: z.string().trim().min(1, 'placeId is required'),
  sessionToken: z.string().trim().optional(),
});
