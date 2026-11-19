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
  };
  costEstimation: {
    note: string;
    nearbySearchSku: string;
    placeDetailsSku: string;
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

  private totalDurationMs = 0;

  public static readonly SEARCH_FIELD_MASK =
    'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.parkingOptions,places.currentOpeningHours';

  public static readonly DETAILS_FIELD_MASK =
    'id,displayName,formattedAddress,location,businessStatus,parkingOptions,currentOpeningHours,regularOpeningHours';

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

  public getMetricsSnapshot(): GooglePlacesMetricsSnapshot {
    const totalRequests = this.nearbyAttempts + this.detailsAttempts;
    const totalSuccess = this.nearbySuccess + this.detailsSuccess;
    const totalFailures = this.nearbyFailures + this.detailsFailures;

    const nearbySuccessRate =
      this.nearbyAttempts > 0
        ? Number(((this.nearbySuccess / this.nearbyAttempts) * 100).toFixed(1))
        : 100.0;

    const detailsSuccessRate =
      this.detailsAttempts > 0
        ? Number(((this.detailsSuccess / this.detailsAttempts) * 100).toFixed(1))
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
      },
      costEstimation: {
        note: 'Estimated costs depend on active Google Cloud Platform billing SKU rates and free tier credits ($200 monthly allowance). Multiply billable requests by current regional SKU rate.',
        nearbySearchSku: 'Places API (New) - Nearby Search (Pro/Enterprise based on field mask)',
        placeDetailsSku: 'Places API (New) - Place Details (Essentials/Pro based on field mask)',
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

    this.totalDurationMs = 0;
  }
}

/// Global shared metrics tracker instance for the Fastify process.
export const globalGooglePlacesMetrics = new GooglePlacesMetrics();
