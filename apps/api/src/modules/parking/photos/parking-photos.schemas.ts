import { z } from 'zod';

export const facilityIdParamSchema = z.object({
  id: z
    .string({ required_error: 'Facility ID is required.' })
    .trim()
    .min(1, 'Facility ID cannot be empty.')
    .max(255, 'Facility ID exceeds maximum length.'),
});

export const photoMediaParamsSchema = z.object({
  id: z
    .string({ required_error: 'Facility ID is required.' })
    .trim()
    .min(1, 'Facility ID cannot be empty.')
    .max(255, 'Facility ID exceeds maximum length.'),
  photoIndex: z.coerce
    .number({ invalid_type_error: 'Photo index must be a number.' })
    .int('Photo index must be an integer.')
    .min(0, 'Photo index cannot be negative.')
    .max(9, 'Photo index exceeds maximum allowed index.'),
});

export const photoMediaQuerySchema = z.object({
  maxWidth: z.coerce
    .number()
    .int()
    .min(50, 'maxWidth must be at least 50.')
    .max(4800, 'maxWidth cannot exceed 4800.')
    .optional(),
  maxHeight: z.coerce
    .number()
    .int()
    .min(50, 'maxHeight must be at least 50.')
    .max(4800, 'maxHeight cannot exceed 4800.')
    .optional(),
});

export type FacilityIdParam = z.infer<typeof facilityIdParamSchema>;
export type PhotoMediaParams = z.infer<typeof photoMediaParamsSchema>;
export type PhotoMediaQuery = z.infer<typeof photoMediaQuerySchema>;
