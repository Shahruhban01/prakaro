export interface GooglePlacesLocation {
  latitude?: number;
  longitude?: number;
}

export interface GooglePlacesDisplayName {
  text?: string;
  languageCode?: string;
}

export interface GooglePlacesParkingOptions {
  freeParkingLot?: boolean;
  paidParkingLot?: boolean;
  freeStreetParking?: boolean;
  paidStreetParking?: boolean;
  freeGarageParking?: boolean;
  paidGarageParking?: boolean;
}

export interface GooglePlacesOpeningHoursPeriodPoint {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface GooglePlacesOpeningHoursPeriod {
  open?: GooglePlacesOpeningHoursPeriodPoint;
  close?: GooglePlacesOpeningHoursPeriodPoint;
}

export interface GooglePlacesCurrentOpeningHours {
  openNow?: boolean;
  periods?: GooglePlacesOpeningHoursPeriod[];
  weekdayDescriptions?: string[];
}

export interface GooglePlaceItem {
  id?: string;
  displayName?: GooglePlacesDisplayName;
  formattedAddress?: string;
  location?: GooglePlacesLocation;
  businessStatus?: string;
  parkingOptions?: GooglePlacesParkingOptions;
  currentOpeningHours?: GooglePlacesCurrentOpeningHours;
  regularOpeningHours?: GooglePlacesCurrentOpeningHours;
}

export interface GooglePlacesSearchNearbyResponse {
  places?: GooglePlaceItem[];
}

export interface GooglePlacesSearchNearbyParams {
  latitude: number;
  longitude: number;
  radius: number;
}
