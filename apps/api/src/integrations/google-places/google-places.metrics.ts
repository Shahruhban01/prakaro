/**
 * In-process lightweight metrics tracking for Google Places API usage.
 *
 * Tracks upstream request counts, latencies, failure modes, and field-mask scopes
 * without logging raw API keys, sensitive tokens, or precise user coordinates.
 */
export interface GooglePlacesMetricsSnapshot {
  nearbySearch: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    successRate: number;
  };
  placeDetails: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    successRate: number;
  };
  autocomplete: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    successRate: number;
  };
  destinationResolve: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    successRate: number;
  };
  photoMetadata: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    successRate: number;
  };
  photoMedia: {
    attempts: number;
    success: number;
    failures: number;
    timeouts: number;
    rateLimited: number;
    bytesTransferred: number;
    successRate: number;
  };
  totals: {
    totalUpstreamRequests: number;
    totalSuccess: number;
    totalFailures: number;
    totalDurationMs: number;
    averageDurationMs: number;
  };
  fieldMasks: {
    searchFieldMask: string;
    detailsFieldMask: string;
    photoDetailsFieldMask: string;
  };
  costEstimation: {
    note: string;
    nearbySearchSku: string;
    placeDetailsSku: string;
    placePhotoSku: string;
  };
}

export class GooglePlacesMetrics {
  private nearbyAttempts = 0;
  private nearbySuccess = 0;
  private nearbyFailures = 0;
  private nearbyTimeouts = 0;
  private nearbyRateLimited = 0;

  private detailsAttempts = 0;
  private detailsSuccess = 0;
  private detailsFailures = 0;
  private detailsTimeouts = 0;
  private detailsRateLimited = 0;

  private autocompleteAttempts = 0;
  private autocompleteSuccess = 0;
  private autocompleteFailures = 0;
  private autocompleteTimeouts = 0;
  private autocompleteRateLimited = 0;

  private resolveAttempts = 0;
  private resolveSuccess = 0;
  private resolveFailures = 0;
  private resolveTimeouts = 0;
  private resolveRateLimited = 0;

  private photoMetadataAttempts = 0;
  private photoMetadataSuccess = 0;
  private photoMetadataFailures = 0;
  private photoMetadataTimeouts = 0;
  private photoMetadataRateLimited = 0;

  private photoMediaAttempts = 0;
  private photoMediaSuccess = 0;
  private photoMediaFailures = 0;
  private photoMediaTimeouts = 0;
  private photoMediaRateLimited = 0;
  private photoMediaBytesTransferred = 0;

  private totalDurationMs = 0;

  public static readonly SEARCH_FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.parkingOptions,places.currentOpeningHours';

  public static readonly DETAILS_FIELD_MASK =
    'id,displayName,formattedAddress,location,businessStatus,parkingOptions,currentOpeningHours,regularOpeningHours';

  public static readonly PHOTO_DETAILS_FIELD_MASK = 'id,photos';

  public recordNearbyAttempt(): void {
    this.nearbyAttempts++;
  }

  public recordNearbySuccess(durationMs: number): void {
    this.nearbySuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordNearbyFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.nearbyFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.nearbyTimeouts++;
    if (options?.isRateLimit) this.nearbyRateLimited++;
  }

  public recordDetailsAttempt(): void {
    this.detailsAttempts++;
  }

  public recordDetailsSuccess(durationMs: number): void {
    this.detailsSuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordDetailsFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.detailsFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.detailsTimeouts++;
    if (options?.isRateLimit) this.detailsRateLimited++;
  }

  public recordAutocompleteAttempt(): void {
    this.autocompleteAttempts++;
  }

  public recordAutocompleteSuccess(durationMs: number): void {
    this.autocompleteSuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordAutocompleteFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.autocompleteFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.autocompleteTimeouts++;
    if (options?.isRateLimit) this.autocompleteRateLimited++;
  }

  public recordResolveAttempt(): void {
    this.resolveAttempts++;
  }

  public recordResolveSuccess(durationMs: number): void {
    this.resolveSuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordResolveFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.resolveFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.resolveTimeouts++;
    if (options?.isRateLimit) this.resolveRateLimited++;
  }

  public recordPhotoMetadataAttempt(): void {
    this.photoMetadataAttempts++;
  }

  public recordPhotoMetadataSuccess(durationMs: number): void {
    this.photoMetadataSuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  public recordPhotoMetadataFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.photoMetadataFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.photoMetadataTimeouts++;
    if (options?.isRateLimit) this.photoMetadataRateLimited++;
  }

  public recordPhotoMediaAttempt(): void {
    this.photoMediaAttempts++;
  }

  public recordPhotoMediaSuccess(durationMs: number, bytesTransferred?: number): void {
    this.photoMediaSuccess++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (bytesTransferred) {
      this.photoMediaBytesTransferred += Math.max(0, bytesTransferred);
    }
  }

  public recordPhotoMediaFailure(
    durationMs: number,
    options?: { isTimeout?: boolean; isRateLimit?: boolean },
  ): void {
    this.photoMediaFailures++;
    this.totalDurationMs += Math.max(0, durationMs);
    if (options?.isTimeout) this.photoMediaTimeouts++;
    if (options?.isRateLimit) this.photoMediaRateLimited++;
  }

  public getMetricsSnapshot(): GooglePlacesMetricsSnapshot {
    const totalRequests =
      this.nearbyAttempts +
      this.detailsAttempts +
      this.autocompleteAttempts +
      this.resolveAttempts +
      this.photoMetadataAttempts +
      this.photoMediaAttempts;
    const totalSuccess =
      this.nearbySuccess +
      this.detailsSuccess +
      this.autocompleteSuccess +
      this.resolveSuccess +
      this.photoMetadataSuccess +
      this.photoMediaSuccess;
    const totalFailures =
      this.nearbyFailures +
      this.detailsFailures +
      this.autocompleteFailures +
      this.resolveFailures +
      this.photoMetadataFailures +
      this.photoMediaFailures;

    const nearbySuccessRate =
      this.nearbyAttempts > 0
        ? Number(((this.nearbySuccess / this.nearbyAttempts) * 100).toFixed(1))
        : 100.0;

    const detailsSuccessRate =
      this.detailsAttempts > 0
        ? Number(((this.detailsSuccess / this.detailsAttempts) * 100).toFixed(1))
        : 100.0;

    const autocompleteSuccessRate =
      this.autocompleteAttempts > 0
        ? Number(((this.autocompleteSuccess / this.autocompleteAttempts) * 100).toFixed(1))
        : 100.0;

    const resolveSuccessRate =
      this.resolveAttempts > 0
        ? Number(((this.resolveSuccess / this.resolveAttempts) * 100).toFixed(1))
        : 100.0;

    const photoMetadataSuccessRate =
      this.photoMetadataAttempts > 0
        ? Number(((this.photoMetadataSuccess / this.photoMetadataAttempts) * 100).toFixed(1))
        : 100.0;

    const photoMediaSuccessRate =
      this.photoMediaAttempts > 0
        ? Number(((this.photoMediaSuccess / this.photoMediaAttempts) * 100).toFixed(1))
        : 100.0;

    const averageDurationMs =
      totalRequests > 0 ? Math.round(this.totalDurationMs / totalRequests) : 0;

    return {
      nearbySearch: {
        attempts: this.nearbyAttempts,
        success: this.nearbySuccess,
        failures: this.nearbyFailures,
        timeouts: this.nearbyTimeouts,
        rateLimited: this.nearbyRateLimited,
        successRate: nearbySuccessRate,
      },
      placeDetails: {
        attempts: this.detailsAttempts,
        success: this.detailsSuccess,
        failures: this.detailsFailures,
        timeouts: this.detailsTimeouts,
        rateLimited: this.detailsRateLimited,
        successRate: detailsSuccessRate,
      },
      autocomplete: {
        attempts: this.autocompleteAttempts,
        success: this.autocompleteSuccess,
        failures: this.autocompleteFailures,
        timeouts: this.autocompleteTimeouts,
        rateLimited: this.autocompleteRateLimited,
        successRate: autocompleteSuccessRate,
      },
      destinationResolve: {
        attempts: this.resolveAttempts,
        success: this.resolveSuccess,
        failures: this.resolveFailures,
        timeouts: this.resolveTimeouts,
        rateLimited: this.resolveRateLimited,
        successRate: resolveSuccessRate,
      },
      photoMetadata: {
        attempts: this.photoMetadataAttempts,
        success: this.photoMetadataSuccess,
        failures: this.photoMetadataFailures,
        timeouts: this.photoMetadataTimeouts,
        rateLimited: this.photoMetadataRateLimited,
        successRate: photoMetadataSuccessRate,
      },
      photoMedia: {
        attempts: this.photoMediaAttempts,
        success: this.photoMediaSuccess,
        failures: this.photoMediaFailures,
        timeouts: this.photoMediaTimeouts,
        rateLimited: this.photoMediaRateLimited,
        bytesTransferred: this.photoMediaBytesTransferred,
        successRate: photoMediaSuccessRate,
      },
      totals: {
        totalUpstreamRequests: totalRequests,
        totalSuccess,
        totalFailures,
        totalDurationMs: this.totalDurationMs,
        averageDurationMs,
      },
      fieldMasks: {
        searchFieldMask: GooglePlacesMetrics.SEARCH_FIELD_MASK,
        detailsFieldMask: GooglePlacesMetrics.DETAILS_FIELD_MASK,
        photoDetailsFieldMask: GooglePlacesMetrics.PHOTO_DETAILS_FIELD_MASK,
      },
      costEstimation: {
        note: 'Estimated costs depend on active Google Cloud Platform billing SKU rates and free tier credits ($200 monthly allowance). Multiply billable requests by current regional SKU rate.',
        nearbySearchSku: 'Places API (New) - Nearby Search (Pro/Enterprise based on field mask)',
        placeDetailsSku: 'Places API (New) - Place Details (Essentials/Pro based on field mask)',
        placePhotoSku: 'Places API (New) - Place Photo (Media fetch per requested photo)',
      },
    };
  }

  public reset(): void {
    this.nearbyAttempts = 0;
    this.nearbySuccess = 0;
    this.nearbyFailures = 0;
    this.nearbyTimeouts = 0;
    this.nearbyRateLimited = 0;

    this.detailsAttempts = 0;
    this.detailsSuccess = 0;
    this.detailsFailures = 0;
    this.detailsTimeouts = 0;
    this.detailsRateLimited = 0;

    this.autocompleteAttempts = 0;
    this.autocompleteSuccess = 0;
    this.autocompleteFailures = 0;
    this.autocompleteTimeouts = 0;
    this.autocompleteRateLimited = 0;

    this.resolveAttempts = 0;
    this.resolveSuccess = 0;
    this.resolveFailures = 0;
    this.resolveTimeouts = 0;
    this.resolveRateLimited = 0;

    this.photoMetadataAttempts = 0;
    this.photoMetadataSuccess = 0;
    this.photoMetadataFailures = 0;
    this.photoMetadataTimeouts = 0;
    this.photoMetadataRateLimited = 0;

    this.photoMediaAttempts = 0;
    this.photoMediaSuccess = 0;
    this.photoMediaFailures = 0;
    this.photoMediaTimeouts = 0;
    this.photoMediaRateLimited = 0;
    this.photoMediaBytesTransferred = 0;

    this.totalDurationMs = 0;
  }
}

/// Global shared metrics tracker instance for the Fastify process.
export const globalGooglePlacesMetrics = new GooglePlacesMetrics();
