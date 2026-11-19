import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import {
  GooglePlacesAutocompleteResponse,
  GooglePlaceItem,
} from '../src/integrations/google-places/google-places.types';

function createMockPlacesClient() {
  const mockAutocompleteResponse: GooglePlacesAutocompleteResponse = {
    suggestions: [
      {
        placePrediction: {
          place: 'places/ChIJdest123',
          placeId: 'ChIJdest123',
          text: { text: 'Connaught Place, New Delhi, Delhi, India' },
          structuredFormat: {
            mainText: { text: 'Connaught Place' },
            secondaryText: { text: 'New Delhi, Delhi, India' },
          },
          types: ['locality', 'political'],
        },
      },
    ],
  };

  const mockDetailsResponse: GooglePlaceItem = {
    id: 'ChIJdest123',
    displayName: { text: 'Connaught Place', languageCode: 'en' },
    formattedAddress: 'Connaught Place, New Delhi, Delhi 110001, India',
    location: {
      latitude: 28.6315,
      longitude: 77.2167,
    },
    types: ['locality', 'political'],
  };

  const mockFetch = async (
    input: string | URL | Request,
  ): Promise<Response> => {
    const urlStr = input.toString();

    if (urlStr.includes(':autocomplete')) {
      return new Response(JSON.stringify(mockAutocompleteResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('/places/ChIJdest123')) {
      return new Response(JSON.stringify(mockDetailsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return new GooglePlacesClient('TEST_API_KEY', 8000, mockFetch as unknown as typeof fetch);
}

describe('Milestone 10: Auth, Cloud Sync & Destination Search API', () => {
  const mockClient = createMockPlacesClient();
  const app = buildApp({ googlePlacesClient: mockClient });

  const testUser1 = {
    name: 'Test Driver 1',
    email: `driver1_${Date.now()}@prakaro.test`,
    password: 'Password123!',
  };

  const testUser2 = {
    name: 'Test Driver 2',
    email: `driver2_${Date.now()}@prakaro.test`,
    password: 'Password123!',
  };

  let token1 = '';
  let token2 = '';
  let user1Id = '';
  let user2Id = '';

  before(async () => {
    await app.ready();
  });

  after(async () => {
    if (user1Id) {
      await prisma.user.deleteMany({ where: { id: user1Id } }).catch(() => {});
    }
    if (user2Id) {
      await prisma.user.deleteMany({ where: { id: user2Id } }).catch(() => {});
    }
    await app.close();
  });

  describe('Better Auth Email/Password & Bearer Plugin', () => {
    it('registers user 1 via /api/auth/sign-up/email and returns token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: {
          name: testUser1.name,
          email: testUser1.email,
          password: testUser1.password,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.token, 'Response should contain bearer token');
      assert.ok(body.user, 'Response should contain user object');
      assert.strictEqual(body.user.email, testUser1.email);
      token1 = body.token;
      user1Id = body.user.id;
    });

    it('registers user 2 via /api/auth/sign-up/email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: {
          name: testUser2.name,
          email: testUser2.email,
          password: testUser2.password,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.token);
      token2 = body.token;
      user2Id = body.user.id;
    });

    it('authenticates user 1 via /api/auth/sign-in/email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: {
          email: testUser1.email,
          password: testUser1.password,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.token);
      assert.strictEqual(body.user.email, testUser1.email);
      token1 = body.token;
    });

    it('rejects sign-in with invalid password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: {
          email: testUser1.email,
          password: 'WrongPassword123!',
        },
      });

      assert.strictEqual(res.statusCode, 401);
    });

    it('retrieves active session via /api/auth/get-session using Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(body.session);
      assert.strictEqual(body.user.id, user1Id);
    });
  });

  describe('Route Protection & 401 Handling', () => {
    it('rejects unauthenticated request to /api/v1/users/me/saved-parking with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
      });

      assert.strictEqual(res.statusCode, 401);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    });

    it('rejects invalid Bearer token with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: 'Bearer invalid-token-xyz',
        },
      });

      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('Cloud Saved Parking & Cross-User Isolation', () => {
    const testPlaceId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

    it('user 1 initially has empty saved parking', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.length, 0);
      assert.strictEqual(body.meta.count, 0);
    });

    it('user 1 saves a parking facility by placeId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        payload: {
          providerPlaceId: testPlaceId,
          provider: 'google',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.providerPlaceId, testPlaceId);
      assert.strictEqual(body.data.userId, user1Id);
    });

    it('saving the same facility again is idempotent (upsert)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        payload: {
          providerPlaceId: testPlaceId,
        },
      });

      assert.strictEqual(res.statusCode, 201);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      const body = JSON.parse(listRes.body);
      assert.strictEqual(body.data.length, 1);
    });

    it('isolates user data: user 2 cannot see user 1 saved parking', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token2}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.length, 0);
    });

    it('user 1 can delete saved parking by placeId', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/me/saved-parking/${testPlaceId}`,
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      const body = JSON.parse(listRes.body);
      assert.strictEqual(body.data.length, 0);
    });
  });

  describe('User Preferences & Privacy-First Recent Searches', () => {
    it('returns default preferences (recentSearchEnabled: false)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/preferences',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.recentSearchEnabled, false);
      assert.strictEqual(body.data.defaultRadiusMeters, 3000);
    });

    it('recent search is not recorded when opt-in is false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        payload: {
          latitude: 28.6139,
          longitude: 77.2090,
          radiusMeters: 3000,
          originType: 'currentLocation',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.meta.recorded, false);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      const listBody = JSON.parse(listRes.body);
      assert.strictEqual(listBody.meta.recordingEnabled, false);
      assert.strictEqual(listBody.data.length, 0);
    });

    it('enables recent search recording via preferences PATCH', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/preferences',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        payload: {
          recentSearchEnabled: true,
          defaultRadiusMeters: 5000,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.recentSearchEnabled, true);
      assert.strictEqual(body.data.defaultRadiusMeters, 5000);
    });

    it('records recent search when enabled', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
        payload: {
          latitude: 28.6315,
          longitude: 77.2167,
          radiusMeters: 3000,
          originType: 'destination',
          providerPlaceId: 'ChIJdest123',
          destinationLabel: 'Connaught Place',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.destinationLabel, 'Connaught Place');
      assert.strictEqual(body.data.originType, 'destination');

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      const listBody = JSON.parse(listRes.body);
      assert.strictEqual(listBody.meta.recordingEnabled, true);
      assert.strictEqual(listBody.data.length, 1);
    });

    it('clears all recent searches via DELETE /api/v1/users/me/recent-searches', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/recent-searches',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      const listBody = JSON.parse(listRes.body);
      assert.strictEqual(listBody.data.length, 0);
    });
  });

  describe('Destination Search & Place Autocomplete Endpoints', () => {
    it('returns autocomplete suggestions via POST /api/v1/places/autocomplete', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/places/autocomplete',
        payload: {
          input: 'Connaught',
          sessionToken: '123e4567-e89b-12d3-a456-426614174000',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 1);
      assert.strictEqual(body.data[0].placeId, 'ChIJdest123');
      assert.strictEqual(body.data[0].primaryText, 'Connaught Place');
      assert.strictEqual(body.meta.sessionActive, true);
    });

    it('rejects empty autocomplete input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/places/autocomplete',
        payload: {
          input: '',
          sessionToken: '123e4567-e89b-12d3-a456-426614174000',
        },
      });

      assert.strictEqual(res.statusCode, 400);
    });

    it('resolves destination coordinates via POST /api/v1/places/resolve', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/places/resolve',
        payload: {
          placeId: 'ChIJdest123',
          sessionToken: '123e4567-e89b-12d3-a456-426614174000',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.data.placeId, 'ChIJdest123');
      assert.strictEqual(body.data.name, 'Connaught Place');
      assert.strictEqual(body.data.latitude, 28.6315);
      assert.strictEqual(body.data.longitude, 77.2167);
      assert.strictEqual(body.meta.sessionConcluded, true);
    });
  });

  describe('Account Deletion with Cascading Deletions', () => {
    it('deletes user account and cascades all user data', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/saved-parking',
        headers: { authorization: `Bearer ${token1}` },
        payload: { providerPlaceId: 'ChIJcascadeTest' },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.success, true);

      const user = await prisma.user.findUnique({ where: { id: user1Id } });
      assert.strictEqual(user, null);

      const savedCount = await prisma.savedParking.count({ where: { userId: user1Id } });
      assert.strictEqual(savedCount, 0);

      const checkRes = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/saved-parking',
        headers: { authorization: `Bearer ${token1}` },
      });
      assert.strictEqual(checkRes.statusCode, 401);

      user1Id = '';
    });
  });
});
