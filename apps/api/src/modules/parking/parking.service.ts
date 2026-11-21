import { GooglePlacesClient } from '../../integrations/google-places/google-places.client';
import {
  mapGooglePlacesResponse,
  mapGooglePlaceToParkingFacility,
} from '../../integrations/google-places/google-places.mapper';
import { NearbyParkingQuery, NearbyParkingResponse, ParkingFacility } from './parking.types';
import type { DiscoveryObserver } from '../intelligence/intelligence.shadow';

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
    const sort = query.sort ?? 'distance';

    // 1. Logical Filtering
    const filtered = candidates.filter((facility) => {
      // Pricing Filter
      if (pricing === 'free') {
        const isFree = facility.pricingType === 'free' || facility.pricingType === 'mixed';
        if (!isFree) return false;
      } else if (pricing === 'paid') {
        const isPaid = facility.pricingType === 'paid' || facility.pricingType === 'mixed';
        if (!isPaid) return false;
      }
      // 'all' includes free, paid, mixed, and unknown

      // Open Now Filter
      if (openNow) {
        if (facility.openingStatus !== 'open') return false;
      }

      // Access Filter
      if (access === 'public') {
        if (facility.accessType !== 'public') return false;
      }

      return true;
    });

    // 2. Sorting (Default: Nearest First by straight-line Haversine distance)
    if (sort === 'distance') {
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
    }

    return {
      data: filtered,
      meta: {
        count: filtered.length,
        totalDiscovered,
        radiusMeters: query.radius,
        filterApplied: {
          pricing,
          openNow,
          access,
          sort,
        },
        filteredOnCandidateSet: true,
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
    return mapGooglePlaceToParkingFacility(rawPlace);
  }

  public getMetricsSnapshot() {
    return this.googlePlacesClient.getMetrics().getMetricsSnapshot();
  }
}
