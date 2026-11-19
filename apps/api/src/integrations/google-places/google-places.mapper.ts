import { GooglePlaceItem, GooglePlacesSearchNearbyResponse } from './google-places.types';
import { ParkingFacility } from '../../modules/parking/parking.types';

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

  return {
    id: `google:${item.id.trim()}`,
    name,
    latitude: lat,
    longitude: lng,
    address,
    source: 'google',
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
