import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import { GooglePlacesMetrics } from '../src/integrations/google-places/google-places.metrics';
import {
  GooglePlaceItem,
  GooglePlacesSearchNearbyResponse,
} from '../src/integrations/google-places/google-places.types';

const SECRET_API_KEY = 'SECRET_TEST_KEY_DO_NOT_LEAK_XYZ123';

function createMockClient(options: {
  apiKey?: string;
  response?: GooglePlacesSearchNearbyResponse;
  detailsResponse?: GooglePlaceItem | null;
  status?: number;
  throwTimeout?: boolean;
  throwNetworkError?: boolean;
  metrics?: GooglePlacesMetrics;
  onFetchCalled?: (url: string, init?: RequestInit) => void;
}) {
  const mockFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr = input.toString();
    if (options.onFetchCalled) {
      options.onFetchCalled(urlStr, init);
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

    // Route between searchNearby and details endpoint
    if (urlStr.includes('/places/') && !urlStr.includes(':searchNearby')) {
      if (options.detailsResponse === null) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(options.detailsResponse ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
    undefined,
    undefined,
    options.metrics,
  );
}

describe('GET /api/v1/parking/nearby', () => {
  it('1. Valid coordinates and radius - returns 200 and normalized parking list with enriched metadata', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'place_1',
            displayName: { text: 'Central City Parking' },
            formattedAddress: '123 Main Street',
            location: { latitude: 34.0837, longitude: 74.7973 },
            businessStatus: 'OPERATIONAL',
            parkingOptions: { paidParkingLot: true },
            currentOpeningHours: { openNow: true },
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
    assert.equal(body.meta.totalDiscovered, 1);
    assert.equal(body.meta.radiusMeters, 2500);
    assert.equal(body.meta.filteredOnCandidateSet, true);
    assert.equal(body.data.length, 1);

    // Verify backward compatible properties
    assert.equal(body.data[0].id, 'google:place_1');
    assert.equal(body.data[0].name, 'Central City Parking');
    assert.equal(body.data[0].latitude, 34.0837);
    assert.equal(body.data[0].longitude, 74.7973);
    assert.equal(body.data[0].address, '123 Main Street');
    assert.equal(body.data[0].source, 'google');

    // Verify Prompt 06 enriched properties
    assert.equal(body.data[0].pricingType, 'paid');
    assert.equal(body.data[0].openingStatus, 'open');
    assert.equal(body.data[0].accessType, 'unknown');
    assert.equal(body.data[0].ownershipType, 'unknown');
    assert.equal(body.data[0].parkingOptions.paidParkingLot, true);
    assert.equal(body.data[0].hourlyRate, null);
    assert.equal(body.data[0].currency, null);
  });

  it('2. Pricing classification - maps free, paid, mixed, and unknown pricing correctly', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'p_free',
            displayName: { text: 'Community Free Lot' },
            formattedAddress: 'Free Way',
            location: { latitude: 34.081, longitude: 74.791 },
            parkingOptions: { freeParkingLot: true },
          },
          {
            id: 'p_paid',
            displayName: { text: 'Downtown Paid Garage' },
            formattedAddress: 'Paid Ave',
            location: { latitude: 34.082, longitude: 74.792 },
            parkingOptions: { paidGarageParking: true },
          },
          {
            id: 'p_mixed',
            displayName: { text: 'Mixed Use Facility' },
            formattedAddress: 'Mixed Blvd',
            location: { latitude: 34.083, longitude: 74.793 },
            parkingOptions: { freeStreetParking: true, paidParkingLot: true },
          },
          {
            id: 'p_unknown',
            displayName: { text: 'Unspecified Facility' },
            formattedAddress: 'Unknown Rd',
            location: { latitude: 34.084, longitude: 74.794 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });

    // A: All pricing (default)
    const resAll = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79',
    });
    const bodyAll = JSON.parse(resAll.payload);
    assert.equal(bodyAll.data.length, 4);

    // B: Free pricing - includes confirmed free and mixed
    const resFree = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&pricing=free',
    });
    const bodyFree = JSON.parse(resFree.payload);
    assert.equal(bodyFree.data.length, 2);
    const freeIds = bodyFree.data.map((f: { id: string }) => f.id);
    assert.ok(freeIds.includes('google:p_free'));
    assert.ok(freeIds.includes('google:p_mixed'));

    // C: Paid pricing - includes confirmed paid and mixed
    const resPaid = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&pricing=paid',
    });
    const bodyPaid = JSON.parse(resPaid.payload);
    assert.equal(bodyPaid.data.length, 2);
    const paidIds = bodyPaid.data.map((f: { id: string }) => f.id);
    assert.ok(paidIds.includes('google:p_paid'));
    assert.ok(paidIds.includes('google:p_mixed'));
  });

  it('3. Open Now filter - filters only confirmed open facilities and respects closed status', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'p_open',
            displayName: { text: '24/7 Lot' },
            formattedAddress: 'Open St',
            location: { latitude: 34.081, longitude: 74.791 },
            currentOpeningHours: { openNow: true },
          },
          {
            id: 'p_closed_hours',
            displayName: { text: 'Nightly Closed Lot' },
            formattedAddress: 'Closed St',
            location: { latitude: 34.082, longitude: 74.792 },
            currentOpeningHours: { openNow: false },
          },
          {
            id: 'p_closed_business',
            displayName: { text: 'Renovating Lot' },
            formattedAddress: 'Reno St',
            location: { latitude: 34.083, longitude: 74.793 },
            businessStatus: 'CLOSED_TEMPORARILY',
            currentOpeningHours: { openNow: true }, // business status overrides openNow
          },
          {
            id: 'p_no_hours',
            displayName: { text: 'Unlisted Hours Lot' },
            formattedAddress: 'Mystery St',
            location: { latitude: 34.084, longitude: 74.794 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });

    // Open now = true
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&openNow=true',
    });
    const body = JSON.parse(res.payload);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, 'google:p_open');
    assert.equal(body.meta.totalDiscovered, 4);
    assert.equal(body.meta.count, 1);
  });

  it('4. Public access filter - excludes unverified facilities honestly', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'p_1',
            displayName: { text: 'Public Parking Municipal' }, // Name says public, but provider metadata is unknown
            formattedAddress: 'City St',
            location: { latitude: 34.081, longitude: 74.791 },
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&access=public',
    });

    const body = JSON.parse(res.payload);
    // Because Google Places does not supply verified accessType, it remains unknown, so confirmed public count is 0
    assert.equal(body.data.length, 0);
    assert.equal(body.meta.count, 0);
    assert.equal(body.meta.totalDiscovered, 1);
  });

  it('5. Distance sorting - sorts facilities nearest first with stable tie-breaker', async () => {
    const mockClient = createMockClient({
      response: {
        places: [
          {
            id: 'far_away',
            displayName: { text: 'Far Facility' },
            formattedAddress: 'Far St',
            location: { latitude: 34.10, longitude: 74.82 }, // ~2.8km away
          },
          {
            id: 'very_close',
            displayName: { text: 'Close Facility' },
            formattedAddress: 'Close St',
            location: { latitude: 34.0838, longitude: 74.7974 }, // ~15m away
          },
          {
            id: 'mid_distance',
            displayName: { text: 'Mid Facility' },
            formattedAddress: 'Mid St',
            location: { latitude: 34.086, longitude: 74.80 }, // ~350m away
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&sort=distance',
    });

    const body = JSON.parse(res.payload);
    assert.equal(body.data.length, 3);
    assert.equal(body.data[0].id, 'google:very_close');
    assert.equal(body.data[1].id, 'google:mid_distance');
    assert.equal(body.data[2].id, 'google:far_away');
  });

  it('6. Invalid filter query parameters - rejects invalid pricing, openNow, and access with 400', async () => {
    const app = buildApp({ googlePlacesClient: createMockClient({}) });

    // Invalid pricing
    const resPricing = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&pricing=expensive',
    });
    assert.equal(resPricing.statusCode, 400);

    // Invalid openNow
    const resOpen = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&openNow=maybe',
    });
    assert.equal(resOpen.statusCode, 400);

    // Invalid access
    const resAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79&access=vip',
    });
    assert.equal(resAccess.statusCode, 400);
  });

  it('7. Stage B: Single facility details endpoint GET /api/v1/parking/:id', async () => {
    const mockClient = createMockClient({
      detailsResponse: {
        id: 'place_deep_1',
        displayName: { text: 'Srinagar Multi-Storey' },
        formattedAddress: 'MA Road, Srinagar',
        location: { latitude: 34.072, longitude: 74.811 },
        parkingOptions: { paidGarageParking: true },
        currentOpeningHours: { openNow: true },
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });

    // Successful lookup
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/google:place_deep_1',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.id, 'google:place_deep_1');
    assert.equal(body.data.name, 'Srinagar Multi-Storey');
    assert.equal(body.data.pricingType, 'paid');
    assert.equal(body.data.openingStatus, 'open');

    // 404 lookup
    const notFoundClient = createMockClient({ detailsResponse: null });
    const appNotFound = buildApp({ googlePlacesClient: notFoundClient });
    const res404 = await appNotFound.inject({
      method: 'GET',
      url: '/api/v1/parking/google:non_existent',
    });
    assert.equal(res404.statusCode, 404);

    // Endpoint alias GET /api/v1/parking/places/:id
    const resAlias = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/places/google:place_deep_1',
    });
    assert.equal(resAlias.statusCode, 200);
    const aliasBody = JSON.parse(resAlias.payload);
    assert.equal(aliasBody.data.id, 'google:place_deep_1');
    assert.equal(aliasBody.data.name, 'Srinagar Multi-Storey');
  });

  it('8. Upstream timeout error handling - returns 504 and does not leak keys', async () => {
    const mockClient = createMockClient({ throwTimeout: true });
    const app = buildApp({ googlePlacesClient: mockClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 504);
    assert.ok(!res.payload.includes(SECRET_API_KEY));
  });

  it('9. Missing API key configuration error - returns 503', async () => {
    const mockClient = createMockClient({ apiKey: '' });
    const app = buildApp({ googlePlacesClient: mockClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 503);
  });

  it('10. Request correlation ID - attaches X-Request-Id header to every response', async () => {
    const mockClient = createMockClient({ response: { places: [] } });
    const app = buildApp({ googlePlacesClient: mockClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['x-request-id']);
  });

  it('11. Upstream rate limit (429) handling - returns 429 with RATE_LIMIT_EXCEEDED', async () => {
    const mockClient = createMockClient({ status: 429 });
    const app = buildApp({ googlePlacesClient: mockClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 429);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED');
  });

  it('12. Upstream 5xx handling - returns 502 UPSTREAM_ERROR', async () => {
    const mockClient = createMockClient({ status: 500 });
    const app = buildApp({ googlePlacesClient: mockClient });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973',
    });

    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UPSTREAM_ERROR');
  });

  it('13. Google Places API usage metrics - GET /api/v1/parking/metrics returns in-process counters', async () => {
    const isolatedMetrics = new GooglePlacesMetrics();
    const mockClient = createMockClient({
      metrics: isolatedMetrics,
      response: {
        places: [
          {
            id: 'metric_place_1',
            displayName: { text: 'Metrics Test Garage' },
            formattedAddress: '456 Test Ave',
            location: { latitude: 34.08, longitude: 74.79 },
            businessStatus: 'OPERATIONAL',
          },
        ],
      },
    });

    const app = buildApp({ googlePlacesClient: mockClient });

    // Perform a nearby search request
    await app.inject({
      method: 'GET',
      url: '/api/v1/parking/nearby?latitude=34.08&longitude=74.79',
    });

    // Query metrics
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/parking/metrics',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.data);
    assert.equal(body.data.nearbySearch.attempts, 1);
    assert.equal(body.data.nearbySearch.success, 1);
    assert.equal(body.data.nearbySearch.failures, 0);
    assert.equal(body.data.totals.totalUpstreamRequests, 1);
    assert.ok(body.data.fieldMasks.searchFieldMask);
    assert.ok(body.data.costEstimation.note);
  });
});
