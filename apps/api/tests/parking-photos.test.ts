import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { GooglePlacesClient } from '../src/integrations/google-places/google-places.client';
import { GooglePlacesMetrics } from '../src/integrations/google-places/google-places.metrics';
import { GooglePlacePhoto } from '../src/integrations/google-places/google-places.types';

const SECRET_API_KEY = 'SECRET_TEST_KEY_DO_NOT_LEAK_PHOTOS_XYZ';

const MOCK_JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);

function createMockPhotosClient(options: {
  apiKey?: string;
  photos?: GooglePlacePhoto[];
  status?: number;
  throwTimeout?: boolean;
  throwNetworkError?: boolean;
  mediaStatus?: number;
  mediaContentType?: string;
  mediaBytes?: Uint8Array;
  mediaContentLength?: number;
  metrics?: GooglePlacesMetrics;
  onFetchCalled?: (url: string, init?: RequestInit) => void;
}) {
  const metrics = options.metrics ?? new GooglePlacesMetrics();

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

    // Photo media request
    if (urlStr.includes('/photos/') && urlStr.includes('/media')) {
      const mediaStatus = options.mediaStatus ?? options.status ?? 200;
      if (mediaStatus === 404) {
        return new Response('Not found', { status: 404 });
      }
      if (mediaStatus >= 400) {
        return new Response('Error', { status: mediaStatus });
      }

      const bytes = options.mediaBytes ?? MOCK_JPEG_BYTES;
      const headers: Record<string, string> = {
        'Content-Type': options.mediaContentType ?? 'image/jpeg',
      };
      if (options.mediaContentLength !== undefined) {
        headers['Content-Length'] = String(options.mediaContentLength);
      } else {
        headers['Content-Length'] = String(bytes.byteLength);
      }

      return new Response(bytes, {
        status: mediaStatus,
        headers,
      });
    }

    // Place details with photo metadata
    if (urlStr.includes('/places/')) {
      const status = options.status ?? 200;
      if (status === 404) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (status >= 400) {
        return new Response('Error', { status });
      }

      const body = {
        id: 'ChIJtestparking123',
        photos: options.photos ?? [],
      };

      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  };

  const client = new GooglePlacesClient(
    options.apiKey ?? SECRET_API_KEY,
    8000,
    mockFetch as typeof fetch,
    'https://places.googleapis.com/v1/places:searchNearby',
    'https://places.googleapis.com/v1/places',
    metrics,
  );

  return { client, metrics };
}

describe('Milestone 11: Parking Photos & Visual Facility Details API', () => {
  const samplePhotos: GooglePlacePhoto[] = [
    {
      name: 'places/ChIJtestparking123/photos/photoRef001',
      widthPx: 1920,
      heightPx: 1080,
      authorAttributions: [
        {
          displayName: 'Jane Doe',
          uri: 'https://maps.google.com/maps/contrib/12345',
          photoUri: 'https://lh3.googleusercontent.com/avatar1',
        },
      ],
    },
    {
      name: 'places/ChIJtestparking123/photos/photoRef002',
      widthPx: 1280,
      heightPx: 720,
      authorAttributions: [
        {
          displayName: 'John Smith',
          uri: 'https://maps.google.com/maps/contrib/67890',
        },
      ],
    },
  ];

  describe('Photo Metadata Endpoint: GET /api/v1/parking/:id/photos', () => {
    it('returns normalized photo metadata for a facility with photos', async () => {
      const { client, metrics } = createMockPhotosClient({ photos: samplePhotos });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/google:ChIJtestparking123/photos',
      });

      assert.equal(response.statusCode, 200);
      const json = response.json();
      assert.equal(json.data.length, 2);
      assert.equal(json.meta.count, 2);
      assert.equal(json.meta.source, 'google');

      // Verify photo 0
      const photo0 = json.data[0];
      assert.equal(photo0.id, '0');
      assert.equal(photo0.width, 1920);
      assert.equal(photo0.height, 1080);
      assert.equal(photo0.attributions.length, 1);
      assert.equal(photo0.attributions[0].displayName, 'Jane Doe');
      assert.equal(photo0.attributions[0].uri, 'https://maps.google.com/maps/contrib/12345');
      assert.ok(photo0.mediaUrl.includes('/photos/0/media'));

      // Verify photo 1
      const photo1 = json.data[1];
      assert.equal(photo1.id, '1');
      assert.equal(photo1.width, 1280);
      assert.equal(photo1.height, 720);
      assert.equal(photo1.attributions[0].displayName, 'John Smith');

      // Verify metrics recorded
      const snapshot = metrics.getMetricsSnapshot();
      assert.equal(snapshot.photoMetadata.attempts, 1);
      assert.equal(snapshot.photoMetadata.success, 1);

      // Verify API key is never exposed
      assert.ok(!response.body.includes(SECRET_API_KEY));
    });

    it('returns empty array when facility has no photos without crashing', async () => {
      const { client } = createMockPhotosClient({ photos: [] });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJnophotoparking/photos',
      });

      assert.equal(response.statusCode, 200);
      const json = response.json();
      assert.deepEqual(json.data, []);
      assert.equal(json.meta.count, 0);
      assert.equal(json.meta.source, 'google');
    });

    it('returns 200 with empty array when upstream Place returns 404', async () => {
      const { client } = createMockPhotosClient({ status: 404 });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJnonexistent/photos',
      });

      assert.equal(response.statusCode, 200);
      const json = response.json();
      assert.deepEqual(json.data, []);
      assert.equal(json.meta.count, 0);
    });

    it('limits initial photo gallery to at most 5 photographs', async () => {
      const eightPhotos: GooglePlacePhoto[] = Array.from({ length: 8 }, (_, i) => ({
        name: `places/ChIJtestparking123/photos/photo${i}`,
        widthPx: 800,
        heightPx: 600,
        authorAttributions: [{ displayName: `User ${i}` }],
      }));

      const { client } = createMockPhotosClient({ photos: eightPhotos });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos',
      });

      assert.equal(response.statusCode, 200);
      const json = response.json();
      assert.equal(json.data.length, 5);
      assert.equal(json.meta.count, 5);
    });

    it('handles upstream timeout gracefully with 504', async () => {
      const { client } = createMockPhotosClient({ throwTimeout: true });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos',
      });

      assert.equal(response.statusCode, 504);
      const json = response.json();
      assert.equal(json.error.code, 'UPSTREAM_TIMEOUT');
    });

    it('handles upstream rate limit gracefully with 429', async () => {
      const { client } = createMockPhotosClient({ status: 429 });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos',
      });

      assert.equal(response.statusCode, 429);
      const json = response.json();
      assert.equal(json.error.code, 'RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Photo Media Delivery Endpoint: GET /api/v1/parking/:id/photos/:photoIndex/media', () => {
    it('streams binary photo media with correct Content-Type and Cache-Control', async () => {
      let requestedUrl = '';
      const { client, metrics } = createMockPhotosClient({
        photos: samplePhotos,
        onFetchCalled: (url) => {
          requestedUrl = url;
        },
      });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/google:ChIJtestparking123/photos/0/media?maxWidth=1200&maxHeight=800',
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['content-type'], 'image/jpeg');
      assert.ok(response.headers['cache-control']?.includes('public'));
      assert.equal(response.rawPayload.byteLength, MOCK_JPEG_BYTES.byteLength);

      // Verify Google Places URL included maxWidthPx and maxHeightPx
      assert.ok(requestedUrl.includes('maxWidthPx=1200'));
      assert.ok(requestedUrl.includes('maxHeightPx=800'));
      assert.ok(requestedUrl.includes('places/ChIJtestparking123/photos/photoRef001/media'));

      // Verify metrics
      const snapshot = metrics.getMetricsSnapshot();
      assert.equal(snapshot.photoMedia.attempts, 1);
      assert.equal(snapshot.photoMedia.success, 1);
      assert.ok(snapshot.photoMedia.bytesTransferred > 0);

      // Verify API key is NOT leaked in the response headers or body
      assert.ok(!response.headers['x-goog-api-key']);
      assert.ok(!response.rawPayload.toString().includes(SECRET_API_KEY));
    });

    it('returns 404 when requested photo index does not exist', async () => {
      const { client } = createMockPhotosClient({ photos: samplePhotos });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/9/media',
      });

      assert.equal(response.statusCode, 404);
      const json = response.json();
      assert.equal(json.error.code, 'NOT_FOUND');
      assert.ok(json.error.message.includes('Photo at index 9 was not found'));
    });

    it('returns 400 when photo index is negative or invalid', async () => {
      const { client } = createMockPhotosClient({ photos: samplePhotos });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/-1/media',
      });

      assert.equal(response.statusCode, 400);
      const json = response.json();
      assert.equal(json.error.code, 'INVALID_QUERY_PARAMS');
    });

    it('returns 404 when facility has zero photos', async () => {
      const { client } = createMockPhotosClient({ photos: [] });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJnophotos/photos/0/media',
      });

      assert.equal(response.statusCode, 404);
      const json = response.json();
      assert.equal(json.error.code, 'NOT_FOUND');
      assert.ok(json.error.message.includes('No photos available'));
    });

    it('rejects upstream responses that exceed 10MB size limit', async () => {
      const { client } = createMockPhotosClient({
        photos: samplePhotos,
        mediaContentLength: 15 * 1024 * 1024, // 15MB
      });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/0/media',
      });

      assert.equal(response.statusCode, 502);
      const json = response.json();
      assert.equal(json.error.code, 'UPSTREAM_ERROR');
      assert.ok(json.error.message.includes('exceeded maximum allowed size'));
    });

    it('rejects unexpected non-image content types with 502', async () => {
      const { client } = createMockPhotosClient({
        photos: samplePhotos,
        mediaContentType: 'application/json',
      });
      const app = buildApp({ googlePlacesClient: client });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/0/media',
      });

      assert.equal(response.statusCode, 502);
      const json = response.json();
      assert.equal(json.error.code, 'UPSTREAM_ERROR');
      assert.ok(json.error.message.includes('non-image response'));
    });
  });

  describe('SSRF Protection & Resource Validation', () => {
    it('prevents SSRF by rejecting malformed or arbitrary photo resource paths', async () => {
      const client = new GooglePlacesClient(SECRET_API_KEY);

      await assert.rejects(
        async () => {
          await client.getPhotoMedia('https://evil-server.com/malicious-image.jpg');
        },
        {
          name: 'ValidationError',
          message: 'Invalid photo resource reference.',
        },
      );

      await assert.rejects(
        async () => {
          await client.getPhotoMedia('../../etc/passwd');
        },
        {
          name: 'ValidationError',
          message: 'Invalid photo resource reference.',
        },
      );
    });
  });

  describe('In-Memory Metadata Caching & Efficiency', () => {
    it('uses in-memory cache to prevent duplicate upstream Place Details calls on multiple image requests', async () => {
      let placeDetailsCalls = 0;
      const { client } = createMockPhotosClient({
        photos: samplePhotos,
        onFetchCalled: (url) => {
          if (!url.includes('/media')) {
            placeDetailsCalls++;
          }
        },
      });
      const app = buildApp({ googlePlacesClient: client });

      // First call for photos metadata
      const res1 = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos',
      });
      assert.equal(res1.statusCode, 200);
      assert.equal(placeDetailsCalls, 1);

      // Second call for photo 0 media — should hit in-memory metadata cache!
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/0/media',
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(placeDetailsCalls, 1, 'Place Details was not called again');

      // Third call for photo 1 media — should still hit in-memory metadata cache!
      const res3 = await app.inject({
        method: 'GET',
        url: '/api/v1/parking/ChIJtestparking123/photos/1/media',
      });
      assert.equal(res3.statusCode, 200);
      assert.equal(placeDetailsCalls, 1, 'Place Details was not called again');
    });
  });
});
