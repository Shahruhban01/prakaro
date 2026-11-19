import {
  ConfigurationError,
  UpstreamError,
  UpstreamTimeoutError,
} from '../../common/errors/app-error';
import {
  GooglePlacesSearchNearbyParams,
  GooglePlacesSearchNearbyResponse,
} from './google-places.types';

export class GooglePlacesClient {
  private static readonly DEFAULT_BASE_URL = 'https://places.googleapis.com/v1/places:searchNearby';
  private static readonly DEFAULT_TIMEOUT_MS = 8000;
  private static readonly FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location';

  constructor(
    private readonly apiKey?: string,
    private readonly timeoutMs: number = GooglePlacesClient.DEFAULT_TIMEOUT_MS,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly endpointUrl: string = GooglePlacesClient.DEFAULT_BASE_URL,
  ) {}

  public async searchNearby(
    params: GooglePlacesSearchNearbyParams,
  ): Promise<GooglePlacesSearchNearbyResponse> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError();
    }

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

    try {
      response = await this.fetchFn(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GooglePlacesClient.FIELD_MASK,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          err.message.toLowerCase().includes('timeout') ||
          err.message.toLowerCase().includes('aborted'))
      ) {
        throw new UpstreamTimeoutError();
      }

      throw new UpstreamError();
    }

    if (!response.ok) {
      throw new UpstreamError();
    }

    try {
      const data = (await response.json()) as GooglePlacesSearchNearbyResponse;
      return data;
    } catch {
      throw new UpstreamError('Failed to parse upstream parking data.');
    }
  }
}
