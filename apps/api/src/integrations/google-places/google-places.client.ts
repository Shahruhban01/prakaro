import {
  ConfigurationError,
  UpstreamError,
  UpstreamTimeoutError,
} from '../../common/errors/app-error';
import {
  GooglePlaceItem,
  GooglePlacesSearchNearbyParams,
  GooglePlacesSearchNearbyResponse,
} from './google-places.types';

export class GooglePlacesClient {
  private static readonly DEFAULT_BASE_URL = 'https://places.googleapis.com/v1/places:searchNearby';
  private static readonly DEFAULT_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';
  private static readonly DEFAULT_TIMEOUT_MS = 8000;
  private static readonly SEARCH_FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.parkingOptions,places.currentOpeningHours';
  private static readonly DETAILS_FIELD_MASK =
    'id,displayName,formattedAddress,location,businessStatus,parkingOptions,currentOpeningHours,regularOpeningHours';

  constructor(
    private readonly apiKey?: string,
    private readonly timeoutMs: number = GooglePlacesClient.DEFAULT_TIMEOUT_MS,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly endpointUrl: string = GooglePlacesClient.DEFAULT_BASE_URL,
    private readonly detailsBaseUrl: string = GooglePlacesClient.DEFAULT_DETAILS_BASE_URL,
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
          'X-Goog-FieldMask': GooglePlacesClient.SEARCH_FIELD_MASK,
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

  /**
   * Stage B: On-demand place details for a single place id.
   * Only invoked when specifically requested, avoiding uncontrolled upstream queries.
   */
  public async getPlaceDetails(placeId: string): Promise<GooglePlaceItem | null> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new ConfigurationError();
    }

    const cleanId = placeId.replace(/^google:/, '').trim();
    if (!cleanId) {
      return null;
    }

    const url = `${this.detailsBaseUrl}/${encodeURIComponent(cleanId)}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': GooglePlacesClient.DETAILS_FIELD_MASK,
        },
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

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new UpstreamError();
    }

    try {
      const data = (await response.json()) as GooglePlaceItem;
      return data;
    } catch {
      throw new UpstreamError('Failed to parse upstream place details data.');
    }
  }
}
