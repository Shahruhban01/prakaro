import type { DiscoveryMode, ParkingDecision } from '../intelligence/intelligence.policy';

export type AccessType = 'public' | 'customers_only' | 'private' | 'unknown';
export type OwnershipType = 'public' | 'private' | 'unknown';
export type PricingType = 'free' | 'paid' | 'mixed' | 'unknown';
export type OpeningStatus = 'open' | 'closed' | 'unknown';

export interface ParkingOptions {
  freeParkingLot: boolean | null;
  paidParkingLot: boolean | null;
  freeStreetParking: boolean | null;
  paidStreetParking: boolean | null;
  freeGarageParking: boolean | null;
  paidGarageParking: boolean | null;
}

export interface ParkingFacility {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  source: 'google';
  accessType: AccessType;
  ownershipType: OwnershipType;
  pricingType: PricingType;
  openingStatus: OpeningStatus;
  parkingOptions: ParkingOptions;
  hourlyRate: number | null;
  currency: string | null;
  verification?: ParkingDecision;
}

export interface NearbyParkingQuery {
  latitude: number;
  longitude: number;
  radius: number;
  pricing?: 'all' | 'free' | 'paid';
  openNow?: boolean;
  access?: 'all' | 'public';
  sort?: 'distance';
  mode?: DiscoveryMode;
}

export interface NearbyParkingResponse {
  data: ParkingFacility[];
  meta: {
    count: number;
    totalDiscovered: number;
    radiusMeters: number;
    filterApplied: {
      pricing: 'all' | 'free' | 'paid';
      openNow: boolean;
      access: 'all' | 'public';
      sort: 'distance' | 'recommended';
    };
    filteredOnCandidateSet: boolean;
    intelligence?: {
      available: boolean;
      filteringEnabled: boolean;
      defaultMode: DiscoveryMode;
      mode: DiscoveryMode;
      recommendedOrder: string[];
      notice?: 'NO_VERIFIED_PARKING' | 'VERIFICATION_UNAVAILABLE' | 'FILTERING_DISABLED';
    };
  };
}
