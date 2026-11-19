export interface GooglePlacesLocation {
  latitude?: number;
  longitude?: number;
}

export interface GooglePlacesDisplayName {
  text?: string;
  languageCode?: string;
}

export interface GooglePlaceItem {
  id?: string;
  displayName?: GooglePlacesDisplayName;
  formattedAddress?: string;
  location?: GooglePlacesLocation;
}

export interface GooglePlacesSearchNearbyResponse {
  places?: GooglePlaceItem[];
}

export interface GooglePlacesSearchNearbyParams {
  latitude: number;
  longitude: number;
  radius: number;
}
