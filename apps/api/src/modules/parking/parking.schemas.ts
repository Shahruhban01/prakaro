import { z } from 'zod';
import { discoveryMode } from '../intelligence/intelligence.policy';

function createCoordinateSchema(name: string, min: number, max: number) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') {
        return undefined;
      }
      if (typeof val === 'number') {
        return val;
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === 'Infinity' || trimmed === '-Infinity' || trimmed === 'NaN') {
          return NaN;
        }
        const num = Number(trimmed);
        return Number.isNaN(num) ? 'INVALID_NUMBER' : num;
      }
      return val;
    },
    z
      .number({
        required_error: `${name} is required.`,
        invalid_type_error: `${name} must be a valid number.`,
      })
      .refine((n) => Number.isFinite(n), {
        message: `${name} must be a finite number.`,
      })
      .refine((n) => n >= min && n <= max, {
        message: `${name} must be between ${min} and ${max} degrees.`,
      }),
  );
}

function createRadiusSchema() {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') {
        return 3000;
      }
      if (typeof val === 'number') {
        return val;
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === 'Infinity' || trimmed === '-Infinity' || trimmed === 'NaN') {
          return NaN;
        }
        const num = Number(trimmed);
        return Number.isNaN(num) ? 'INVALID_NUMBER' : num;
      }
      return val;
    },
    z
      .number({
        invalid_type_error: 'Radius must be a valid number.',
      })
      .refine((n) => Number.isFinite(n), {
        message: 'Radius must be a finite number.',
      })
      .refine((n) => n >= 100 && n <= 5000, {
        message: 'Radius must be between 100 and 5000 meters.',
      })
      .default(3000),
  );
}

function createBooleanSchema(defaultValue: boolean) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === '') {
      return defaultValue;
    }
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      return 'INVALID_BOOLEAN';
    }
    return val;
  }, z.boolean({ invalid_type_error: 'Value must be a boolean (true or false).' }).default(defaultValue));
}

export const nearbyParkingQuerySchema = z.object({
  latitude: createCoordinateSchema('Latitude', -90, 90),
  longitude: createCoordinateSchema('Longitude', -180, 180),
  radius: createRadiusSchema(),
  pricing: z
    .enum(['all', 'free', 'paid'], {
      errorMap: () => ({ message: "Pricing filter must be one of: 'all', 'free', 'paid'." }),
    })
    .default('all'),
  openNow: createBooleanSchema(false),
  access: z
    .enum(['all', 'public'], {
      errorMap: () => ({ message: "Access filter must be one of: 'all', 'public'." }),
    })
    .default('all'),
  sort: z
    .enum(['distance'], {
      errorMap: () => ({ message: "Sort option must be 'distance'." }),
    })
    .optional(),
  mode: discoveryMode.optional(),
});

export type NearbyParkingQueryInput = z.infer<typeof nearbyParkingQuerySchema>;

export const facilityIdParamSchema = z.object({
  id: z
    .string({ required_error: 'Facility ID is required.' })
    .trim()
    .min(1, 'Facility ID cannot be empty.'),
});

export type FacilityIdParamInput = z.infer<typeof facilityIdParamSchema>;
