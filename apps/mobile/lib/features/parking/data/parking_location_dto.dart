import '../domain/parking_location.dart';

/// Data Transfer Object for parsing backend parking records.
class ParkingLocationDto {
  const ParkingLocationDto({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.address,
    required this.source,
    this.accessType = AccessType.unknown,
    this.ownershipType = OwnershipType.unknown,
    this.pricingType = PricingType.unknown,
    this.openingStatus = OpeningStatus.unknown,
    this.parkingOptions = ParkingOptions.empty,
    this.hourlyRate,
    this.currency,
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final String address;
  final String source;
  final AccessType accessType;
  final OwnershipType ownershipType;
  final PricingType pricingType;
  final OpeningStatus openingStatus;
  final ParkingOptions parkingOptions;
  final double? hourlyRate;
  final String? currency;

  factory ParkingLocationDto.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final name = json['name'] as String?;
    final lat = (json['latitude'] as num?)?.toDouble();
    final lng = (json['longitude'] as num?)?.toDouble();
    final address = json['address'] as String?;
    final source = json['source'] as String? ?? 'google';

    if (id == null || id.trim().isEmpty) {
      throw const FormatException('Missing or empty parking location id');
    }

    if (lat == null || lng == null || lat.isNaN || lng.isNaN) {
      throw const FormatException('Missing or invalid parking location coordinates');
    }

    final rawOptions = json['parkingOptions'] as Map<String, dynamic>?;
    final hourlyRateNum = (json['hourlyRate'] as num?)?.toDouble();

    return ParkingLocationDto(
      id: id.trim(),
      name: name != null && name.trim().isNotEmpty
          ? name.trim()
          : 'Parking Facility',
      latitude: lat,
      longitude: lng,
      address: address != null && address.trim().isNotEmpty
          ? address.trim()
          : 'Address unavailable',
      source: source,
      accessType: AccessType.fromString(json['accessType'] as String?),
      ownershipType: OwnershipType.fromString(json['ownershipType'] as String?),
      pricingType: PricingType.fromString(json['pricingType'] as String?),
      openingStatus: OpeningStatus.fromString(json['openingStatus'] as String?),
      parkingOptions: ParkingOptions.fromJson(rawOptions),
      hourlyRate: hourlyRateNum,
      currency: json['currency'] as String?,
    );
  }

  ParkingLocation toDomain() {
    return ParkingLocation(
      id: id,
      name: name,
      latitude: latitude,
      longitude: longitude,
      address: address,
      source: source,
      accessType: accessType,
      ownershipType: ownershipType,
      pricingType: pricingType,
      openingStatus: openingStatus,
      parkingOptions: parkingOptions,
      hourlyRate: hourlyRate,
      currency: currency,
    );
  }
}
