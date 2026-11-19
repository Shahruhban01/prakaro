import { GooglePlacesClient } from '../../integrations/google-places/google-places.client';
import { mapGooglePlacesResponse } from '../../integrations/google-places/google-places.mapper';
import { NearbyParkingQuery, NearbyParkingResponse } from './parking.types';

export class ParkingService {
  constructor(private readonly googlePlacesClient: GooglePlacesClient) {}

  public async findNearby(query: NearbyParkingQuery): Promise<NearbyParkingResponse> {
    const googleResponse = await this.googlePlacesClient.searchNearby({
      latitude: query.latitude,
      longitude: query.longitude,
      radius: query.radius,
    });

    const facilities = mapGooglePlacesResponse(googleResponse);

    return {
      data: facilities,
      meta: {
        count: facilities.length,
        radiusMeters: query.radius,
      },
    };
  }
}
