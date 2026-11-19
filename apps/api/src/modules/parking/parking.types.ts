export interface ParkingFacility {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  source: 'google';
}

export interface NearbyParkingQuery {
  latitude: number;
  longitude: number;
  radius: number;
}

export interface NearbyParkingResponse {
  data: ParkingFacility[];
  meta: {
    count: number;
    radiusMeters: number;
  };
}
