/// Domain entity representing a parking facility.
class ParkingLocation {
  const ParkingLocation({
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

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ParkingLocation &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'ParkingLocation(id: $id, name: $name, lat: $latitude, lng: $longitude)';
}
