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
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final String address;
  final String source;

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
    );
  }
}
