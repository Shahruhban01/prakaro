import { GooglePlaceItem, GooglePlacesSearchNearbyResponse } from './google-places.types';
import {
  AccessType,
  OpeningStatus,
  OwnershipType,
  ParkingFacility,
  ParkingOptions,
  PricingType,
} from '../../modules/parking/parking.types';

export function mapGooglePlaceToParkingFacility(item: GooglePlaceItem): ParkingFacility | null {
  if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
    return null;
  }

  const lat = item.location?.latitude;
  const lng = item.location?.longitude;

  // Exclude malformed results that lack usable, finite coordinates
  if (
    lat === undefined ||
    lng === undefined ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  const name = item.displayName?.text?.trim() || 'Parking Facility';
  const address = item.formattedAddress?.trim() || 'Address unavailable';

  // 1. Safely parse parkingOptions
  const rawOpts = item.parkingOptions;
  const parkingOptions: ParkingOptions = {
    freeParkingLot: typeof rawOpts?.freeParkingLot === 'boolean' ? rawOpts.freeParkingLot : null,
    paidParkingLot: typeof rawOpts?.paidParkingLot === 'boolean' ? rawOpts.paidParkingLot : null,
    freeStreetParking:
      typeof rawOpts?.freeStreetParking === 'boolean' ? rawOpts.freeStreetParking : null,
    paidStreetParking:
      typeof rawOpts?.paidStreetParking === 'boolean' ? rawOpts.paidStreetParking : null,
    freeGarageParking:
      typeof rawOpts?.freeGarageParking === 'boolean' ? rawOpts.freeGarageParking : null,
    paidGarageParking:
      typeof rawOpts?.paidGarageParking === 'boolean' ? rawOpts.paidGarageParking : null,
  };

  // 2. Classify Pricing Type: strictly based on provider options, never inferred from name or type
  const hasFree =
    parkingOptions.freeParkingLot === true ||
    parkingOptions.freeStreetParking === true ||
    parkingOptions.freeGarageParking === true;

  const hasPaid =
    parkingOptions.paidParkingLot === true ||
    parkingOptions.paidStreetParking === true ||
    parkingOptions.paidGarageParking === true;

  let pricingType: PricingType = 'unknown';
  if (hasFree && hasPaid) {
    pricingType = 'mixed';
  } else if (hasFree) {
    pricingType = 'free';
  } else if (hasPaid) {
    pricingType = 'paid';
  } else {
    pricingType = 'unknown';
  }

  // 3. Classify Opening Status: strictly based on provider opening hours and operational status
  let openingStatus: OpeningStatus = 'unknown';
  const businessStatus = item.businessStatus;
  const isClosedStatus =
    businessStatus === 'CLOSED_PERMANENTLY' || businessStatus === 'CLOSED_TEMPORARILY';

  if (isClosedStatus) {
    openingStatus = 'closed';
  } else if (typeof item.currentOpeningHours?.openNow === 'boolean') {
    openingStatus = item.currentOpeningHours.openNow ? 'open' : 'closed';
  } else {
    openingStatus = 'unknown';
  }

  // 4. Access and Ownership: Google Places does not reliably provide verified public/private classification
  const accessType: AccessType = 'unknown';
  const ownershipType: OwnershipType = 'unknown';

  return {
    id: `google:${item.id.trim()}`,
    name,
    latitude: lat,
    longitude: lng,
    address,
    source: 'google',
    accessType,
    ownershipType,
    pricingType,
    openingStatus,
    parkingOptions,
    hourlyRate: null,
    currency: null,
  };
}

export function mapGooglePlacesResponse(
  response: GooglePlacesSearchNearbyResponse,
): ParkingFacility[] {
  if (!response.places || !Array.isArray(response.places)) {
    return [];
  }

  const facilities: ParkingFacility[] = [];
  for (const item of response.places) {
    const facility = mapGooglePlaceToParkingFacility(item);
    if (facility) {
      facilities.push(facility);
    }
  }

  return facilities;
}
