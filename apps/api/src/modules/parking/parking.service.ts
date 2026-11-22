import { GooglePlacesClient } from '../../integrations/google-places/google-places.client';
import {
  mapGooglePlacesResponse,
  mapGooglePlaceToParkingFacility,
} from '../../integrations/google-places/google-places.mapper';
import { NearbyParkingQuery, NearbyParkingResponse, ParkingFacility } from './parking.types';
import type { DiscoveryObserver } from '../intelligence/intelligence.shadow';
import type { DiscoveryIntelligence } from '../intelligence/intelligence.discovery';
import { compareRecommendations } from '../intelligence/intelligence.policy';

function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class ParkingService {
  constructor(
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly observeDiscovery?: DiscoveryObserver,
    private readonly intelligence?: DiscoveryIntelligence,
  ) {}

  public async findNearby(query: NearbyParkingQuery): Promise<NearbyParkingResponse> {
    const googleResponse = await this.googlePlacesClient.searchNearby({
      latitude: query.latitude,
      longitude: query.longitude,
      radius: query.radius,
    });

    const candidates = mapGooglePlacesResponse(googleResponse);
    if (googleResponse.places) this.observeDiscovery?.(googleResponse.places);
    const totalDiscovered = candidates.length;

    const pricing = query.pricing ?? 'all';
    const openNow = query.openNow ?? false;
    const access = query.access ?? 'all';
    const intelligence = this.intelligence?.options.displayEnabled ? this.intelligence : undefined;
    const decorated = intelligence ? await intelligence.decorate(candidates) : undefined;
    const settings = intelligence?.options;
    const available = decorated?.available ?? false;
    const filteringEnabled = settings?.filteringEnabled ?? false;
    const defaultMode =
      settings?.defaultMode === 'VERIFIED_ONLY' && !filteringEnabled
        ? 'ALL_CANDIDATES'
        : (settings?.defaultMode ?? 'ALL_CANDIDATES');
    const requested = query.mode ?? defaultMode;
    const mode =
      !available || (requested === 'VERIFIED_ONLY' && !filteringEnabled)
        ? 'ALL_CANDIDATES'
        : requested;
    const sort = mode === 'RECOMMENDED' && !query.sort ? 'recommended' : 'distance';

    // 1. Logical Filtering
    const filtered = (decorated?.data ?? candidates).filter((facility) => {
      const decision = available && filteringEnabled ? facility.verification : undefined;
      const verifiedPrice =
        decision?.pricing === 'FREE'
          ? 'free'
          : decision?.pricing === 'PAID'
            ? 'paid'
            : facility.pricingType;
      // Pricing Filter
      if (pricing === 'free') {
        const isFree = verifiedPrice === 'free' || verifiedPrice === 'mixed';
        if (!isFree) return false;
      } else if (pricing === 'paid') {
        const isPaid = verifiedPrice === 'paid' || verifiedPrice === 'mixed';
        if (!isPaid) return false;
      }
      // 'all' includes free, paid, mixed, and unknown

      // Open Now Filter
      if (openNow) {
        if (facility.openingStatus !== 'open') return false;
      }

      // Access Filter
      if (access === 'public') {
        if (decision ? decision.access !== 'PUBLIC' : facility.accessType !== 'public')
          return false;
      }

      return true;
    });

    // 2. Sorting (Default: Nearest First by straight-line Haversine distance)
    filtered.sort((a, b) => {
      const distA = calculateHaversineDistanceMeters(
        query.latitude,
        query.longitude,
        a.latitude,
        a.longitude,
      );
      const distB = calculateHaversineDistanceMeters(
        query.latitude,
        query.longitude,
        b.latitude,
        b.longitude,
      );

      if (distA !== distB) {
        return distA - distB;
      }
      return a.id.localeCompare(b.id);
    });
    const recommended =
      settings && available
        ? [...filtered].sort((a, b) => compareRecommendations(a.verification, b.verification))
        : filtered;
    const ordered = sort === 'recommended' ? recommended : filtered;
    const data =
      mode === 'VERIFIED_ONLY'
        ? ordered.filter(
            ({ verification }) =>
              verification?.facilityStatus === 'INDEPENDENTLY_VERIFIED' ||
              verification?.facilityStatus === 'STRONGLY_SUPPORTED',
          )
        : ordered;
    const notice = !available
      ? 'VERIFICATION_UNAVAILABLE'
      : requested === 'VERIFIED_ONLY' && !filteringEnabled
        ? 'FILTERING_DISABLED'
        : mode === 'VERIFIED_ONLY' && !data.length
          ? 'NO_VERIFIED_PARKING'
          : undefined;

    return {
      data,
      meta: {
        count: data.length,
        totalDiscovered,
        radiusMeters: query.radius,
        filterApplied: {
          pricing,
          openNow,
          access,
          sort,
        },
        filteredOnCandidateSet: true,
        ...(settings
          ? {
              intelligence: {
                available,
                filteringEnabled,
                defaultMode,
                mode,
                recommendedOrder: available ? [...new Set(recommended.map(({ id }) => id))] : [],
                ...(notice ? { notice } : {}),
              },
            }
          : {}),
      },
    };
  }

  /**
   * Stage B: On-demand place details for a single parking facility.
   */
  public async getFacilityDetails(id: string): Promise<ParkingFacility | null> {
    const rawPlace = await this.googlePlacesClient.getPlaceDetails(id);
    if (!rawPlace) {
      return null;
    }
    const facility = mapGooglePlaceToParkingFacility(rawPlace);
    if (!facility || !this.intelligence?.options.displayEnabled) return facility;
    return (await this.intelligence.decorate([facility])).data[0] ?? facility;
  }

  public getMetricsSnapshot() {
    return this.googlePlacesClient.getMetrics().getMetricsSnapshot();
  }
}
