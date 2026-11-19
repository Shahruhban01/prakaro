import {
  ConfigurationError,
  UpstreamError,
  UpstreamRateLimitError,
  UpstreamTimeoutError,
} from '../../common/errors/app-error';
import {
  GooglePlaceItem,
  GooglePlacesSearchNearbyParams,
  GooglePlacesSearchNearbyResponse,
} from './google-places.types';
import {
  GooglePlacesMetrics,
  globalGooglePlacesMetrics,
} from './google-places.metrics';

export class GooglePlacesClient {
  private static readonly DEFAULT_BASE_URL =
    'https://places.googleapis.com/v1/places:searchNearby';
  private static readonly DEFAULT_DETAILS_BASE_URL =
    'https://places.googleapis.com/v1/places';
  private static readonly DEFAULT_TIMEOUT_MS = 8000;
  private static readonly SEARCH_FIELD_MASK =
    GooglePlacesMetrics.SEARCH_FIELD_MASK;
  private static readonly DETAILS_FIELD_MASK =
    GooglePlacesMetrics.DETAILS_FIELD_MASK;

  constructor(
    private readonly apiKey?: string,
    private readonly timeoutMs: number = GooglePlacesClient.DEFAULT_TIMEOUT_MS,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly endpointUrl: string = GooglePlacesClient.DEFAULT_BASE_URL,
    private readonly detailsBaseUrl: string = GooglePlacesClient.DEFAULT_DETAILS_BASE_URL,
    private readonly metrics: GooglePlacesMetrics = globalGooglePlacesMetrics,
  ) {}

  public getMetrics(): GooglePlacesMetrics {
    return this.metrics;
  }

  public async searchNearby(
    params: GooglePlacesSearchNearbyParams,
    callerSignal?: AbortSignal,
  ): Promise<GooglePlacesSearchNearbyResponse> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError();
    }

    this.metrics.recordNearbyAttempt();
    const startTime = Date.now();

    const payload = {
      includedTypes: ['parking'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: {
            latitude: params.latitude,
            longitude: params.longitude,
          },
          radius: params.radius,
        },
      },
    };

    let response: Response;

    // Combine timeout signal with optional caller abort signal
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = callerSignal
      ? AbortSignal.any([timeoutSignal, callerSignal])
      : timeoutSignal;

    try {
      response = await this.fetchFn(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GooglePlacesClient.SEARCH_FIELD_MASK,
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('aborted'));

      this.metrics.recordNearbyFailure(durationMs, { isTimeout });

      if (isTimeout) {
        throw new UpstreamTimeoutError();
      }

      throw new UpstreamError();
    }

    const durationMs = Date.now() - startTime;

    if (response.status === 429) {
      this.metrics.recordNearbyFailure(durationMs, { isRateLimit: true });
      throw new UpstreamRateLimitError();
    }

    if (!response.ok) {
      this.metrics.recordNearbyFailure(durationMs);
      throw new UpstreamError();
    }

    try {
      const data = (await response.json()) as GooglePlacesSearchNearbyResponse;
      this.metrics.recordNearbySuccess(durationMs);
      return data;
    } catch {
      this.metrics.recordNearbyFailure(durationMs);
      throw new UpstreamError('Failed to parse upstream parking data.');
    }
  }

  /**
   * Stage B: On-demand place details for a single place id.
   * Only invoked when specifically requested, avoiding uncontrolled upstream queries.
   */
  public async getPlaceDetails(
    placeId: string,
    callerSignal?: AbortSignal,
  ): Promise<GooglePlaceItem | null> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError();
    }

    const cleanId = placeId.replace(/^google:/, '').trim();
    if (!cleanId) {
      return null;
    }

    this.metrics.recordDetailsAttempt();
    const startTime = Date.now();

    const url = `${this.detailsBaseUrl}/${encodeURIComponent(cleanId)}`;

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = callerSignal
      ? AbortSignal.any([timeoutSignal, callerSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GooglePlacesClient.DETAILS_FIELD_MASK,
        },
        signal: combinedSignal,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('aborted'));

      this.metrics.recordDetailsFailure(durationMs, { isTimeout });

      if (isTimeout) {
        throw new UpstreamTimeoutError();
      }
      throw new UpstreamError();
    }

    const durationMs = Date.now() - startTime;

    if (response.status === 404) {
      this.metrics.recordDetailsSuccess(durationMs);
      return null;
    }

    if (response.status === 429) {
      this.metrics.recordDetailsFailure(durationMs, { isRateLimit: true });
      throw new UpstreamRateLimitError();
    }

    if (!response.ok) {
      this.metrics.recordDetailsFailure(durationMs);
      throw new UpstreamError();
    }

    try {
      const data = (await response.json()) as GooglePlaceItem;
      this.metrics.recordDetailsSuccess(durationMs);
      return data;
    } catch {
      this.metrics.recordDetailsFailure(durationMs);
      throw new UpstreamError('Failed to parse upstream place details data.');
    }
  }
}
