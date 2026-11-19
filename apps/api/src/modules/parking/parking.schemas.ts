import { z } from 'zod';

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

export const nearbyParkingQuerySchema = z.object({
  latitude: createCoordinateSchema('Latitude', -90, 90),
  longitude: createCoordinateSchema('Longitude', -180, 180),
  radius: createRadiusSchema(),
});

export type NearbyParkingQueryInput = z.infer<typeof nearbyParkingQuerySchema>;
