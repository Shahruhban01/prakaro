import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import { GooglePlacesSearchNearbyResponse } from '../src/integrations/google-places/google-places.types';

const SECRET_API_KEY = 'SECRET_TEST_KEY_DO_NOT_LEAK_XYZ123';

function createMockClient(options: {
  apiKey?: string;
  response?: GooglePlacesSearchNearbyResponse;
  status?: number;
  throwTimeout?: boolean;
  throwNetworkError?: boolean;
  onFetchCalled?: (url: string, init?: RequestInit) => void;
}) {
  const mockFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    if (options.onFetchCalled) {
      options.onFetchCalled(input.toString(), init);
    }

    if (options.throwTimeout) {
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }

    if (options.throwNetworkError) {
      throw new Error('Connection refused');
    }

    const status = options.status ?? 200;
    const body = options.response ?? {};

    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return new GooglePlacesClient(
    options.apiKey ?? SECRET_API_KEY,
    8000,
    mockFetch as unknown as typeof fetch,
  );
}

describe('GET /api/v1/parking/nearby', () => {
  it('1. Valid coordinates and radius - returns 200 and normalized parking list', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'place_1',
            displayName: { text: 'Central City Parking' },
            formattedAddress: '123 Main Street',
            location: { latitude: 34.0837, longitude: 74.7973 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=2500',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.meta.count, 1);
    assert.equal(body.meta.radiusMeters, 2500);
    assert.equal(body.data.length, 1);
    assert.deepEqual(body.data[0], {
      id: 'google:place_1',
      name: 'Central City Parking',
      latitude: 34.0837,
      longitude: 74.7973,
      address: '123 Main Street',
      source: 'google',
    });
  });

  it('2. Default radius - applies 3000 meters when radius query param is omitted', async () => {
    let capturedBody: string | undefined;

    const mockClient = createMockClient({
      response: { places: [] },
      onFetchCalled: (_url, init) => {
        capturedBody = init?.body?.toString();
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.meta.radiusMeters, 3000);

    assert.ok(capturedBody);
    const parsedPayload = JSON.parse(capturedBody);
    assert.equal(parsedPayload.locationRestriction.circle.radius, 3000);
  });

  it('3. Invalid latitude - rejects missing, out-of-range, and non-numeric latitude with 400', async () => {
    const app = buildApp({ googlePlacesClient: createMockClient({}) });

    // Missing latitude
    const resMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?longitude=74.7973',
    });
    assert.equal(resMissing.statusCode, 400);
    const bodyMissing = JSON.parse(resMissing.payload);
    assert.equal(bodyMissing.error.code, 'INVALID_QUERY_PARAMS');

    // Latitude > 90
    const resHigh = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=91&longitude=74.7973',
    });
    assert.equal(resHigh.statusCode, 400);

    // Latitude < -90
    const resLow = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=-90.5&longitude=74.7973',
    });
    assert.equal(resLow.statusCode, 400);

    // Non-numeric latitude
    const resStr = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=invalid&longitude=74.7973',
    });
    assert.equal(resStr.statusCode, 400);

    // Infinity
    const resInf = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=Infinity&longitude=74.7973',
    });
    assert.equal(resInf.statusCode, 400);
  });

  it('4. Invalid longitude - rejects missing, out-of-range, and non-numeric longitude with 400', async () => {
    const app = buildApp({ googlePlacesClient: createMockClient({}) });

    // Missing longitude
    const resMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837',
    });
    assert.equal(resMissing.statusCode, 400);
    const bodyMissing = JSON.parse(resMissing.payload);
    assert.equal(bodyMissing.error.code, 'INVALID_QUERY_PARAMS');

    // Longitude > 180
    const resHigh = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=180.1',
    });
    assert.equal(resHigh.statusCode, 400);

    // Longitude < -180
    const resLow = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=-185',
    });
    assert.equal(resLow.statusCode, 400);

    // Non-numeric longitude
    const resStr = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=not_a_number',
    });
    assert.equal(resStr.statusCode, 400);
  });

  it('5. Invalid radius - rejects radius below 100m, above 5000m, or non-numeric with 400', async () => {
    const app = buildApp({ googlePlacesClient: createMockClient({}) });

    // Radius < 100
    const resLow = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=50',
    });
    assert.equal(resLow.statusCode, 400);
    const bodyLow = JSON.parse(resLow.payload);
    assert.equal(bodyLow.error.code, 'INVALID_QUERY_PARAMS');

    // Radius > 5000
    const resHigh = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=5001',
    });
    assert.equal(resHigh.statusCode, 400);

    // Non-numeric radius
    const resStr = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=huge',
    });
    assert.equal(resStr.statusCode, 400);
  });

  it('6. Successful Google Places response - maps multiple facilities correctly', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'place_a',
            displayName: { text: 'North Lot' },
            formattedAddress: '100 North Rd',
            location: { latitude: 34.09, longitude: 74.8 },
          },
          {
            id: 'place_b',
            displayName: { text: 'South Lot' },
            formattedAddress: '200 South Rd',
            location: { latitude: 34.07, longitude: 74.79 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.length, 2);
    assert.equal(body.meta.count, 2);
    assert.equal(body.data[0].id, 'google:place_a');
    assert.equal(body.data[1].id, 'google:place_b');
  });

  it('7. Empty Google Places response - returns empty data array with 200 status', async () => {
    const mockClient = createMockClient({
      response: { places: [] },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.count, 0);
    assert.equal(body.meta.radiusMeters, 3000);
  });

  it('8. Malformed provider entries - filters invalid entries and provides fallbacks for missing name/address', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          // Missing ID -> must be excluded
          {
            displayName: { text: 'No ID Lot' },
            location: { latitude: 34.08, longitude: 74.79 },
          },
          // Missing coordinates -> must be excluded
          {
            id: 'no_coords',
            displayName: { text: 'No Coords Lot' },
          },
          // Invalid coordinate types / NaN -> must be excluded
          {
            id: 'bad_coords',
            displayName: { text: 'Bad Coords Lot' },
            location: { latitude: NaN, longitude: 74.79 },
          },
          // Valid ID & coords, but missing displayName & formattedAddress -> fallback values
          {
            id: 'fallback_lot',
            location: { latitude: 34.085, longitude: 74.795 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, 'google:fallback_lot');
    assert.equal(body.data[0].name, 'Parking Facility');
    assert.equal(body.data[0].address, 'Address unavailable');
    assert.equal(body.data[0].source, 'google');
  });

  it('9. Provider timeout - returns HTTP 504 with UPSTREAM_TIMEOUT error', async () => {
    const mockClient = createMockClient({
      throwTimeout: true,
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 504);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body, {
      error: {
        code: 'UPSTREAM_TIMEOUT',
        message: 'Google Places request timed out.',
      },
    });
  });

  it('10. Provider error - returns HTTP 502 with UPSTREAM_ERROR on upstream failure', async () => {
    const mockClient = createMockClient({
      status: 500,
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body, {
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'Unable to retrieve nearby parking locations.',
      },
    });
  });

  it('11. Missing Google API key - returns HTTP 503 CONFIGURATION_ERROR while GET /health still works', async () => {
    // Client initialized without API key
    const unconfiguredClient = new GooglePlacesClient(undefined);
    const app = buildApp({ googlePlacesClient: unconfiguredClient });

    // Parking endpoint returns 503
    const resParking = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(resParking.statusCode, 503);
    const bodyParking = JSON.parse(resParking.payload);
    assert.deepEqual(bodyParking, {
      error: {
        code: 'CONFIGURATION_ERROR',
        message:
          'Parking discovery service is not configured. Missing Google Places API credentials.',
      },
    });

    // Health endpoint continues to function normally
    const resHealth = await app.inject({
      method: 'GET',
      url: '/health',
    });
    assert.equal(resHealth.statusCode, 200);
    const bodyHealth = JSON.parse(resHealth.payload);
    assert.deepEqual(bodyHealth, {
      status: 'ok',
      service: 'prakaro-api',
    });
  });

  it('12. Google API key never appearing in the response - ensures secrets are never leaked', async () => {
    const mockClient = createMockClient({
      apiKey: SECRET_API_KEY,
      status: 502,
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.ok(!res.payload.includes(SECRET_API_KEY));
    const headerString = JSON.stringify(res.headers);
    assert.ok(!headerString.includes(SECRET_API_KEY));
  });
});
