/// Represents a locally stored reference to a user-saved parking facility.
///
/// In strict compliance with Google Maps Platform Terms of Service:
/// ZERO Google Places content (names, addresses, coordinates, hours, photos, ratings)
/// is persisted. Only persistent references (ID, provider, providerPlaceId, saved timestamp)
/// are stored.
class SavedParkingRef {
  const SavedParkingRef({
    required this.id,
    required this.provider,
    required this.providerPlaceId,
    required this.savedAt,
  });

  /// Unique internal ID for the saved reference (e.g. "google:ChIJ...").
  final String id;

  /// Provenance / provider identifier (e.g. "google").
  final String provider;

  /// External provider-specific place ID (e.g. "ChIJ...").
  final String providerPlaceId;

  /// Timestamp when the facility was saved locally.
  final DateTime savedAt;

  factory SavedParkingRef.fromParkingLocation({
    required String locationId,
    String? source,
  }) {
    final parts = locationId.split(':');
    final provider = parts.length > 1 ? parts[0] : (source ?? 'google');
    final placeId = parts.length > 1 ? parts.sublist(1).join(':') : locationId;

    return SavedParkingRef(
      id: locationId,
      provider: provider,
      providerPlaceId: placeId,
      savedAt: DateTime.now().toUtc(),
    );
  }

  factory SavedParkingRef.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final provider = json['provider'] as String? ?? 'google';
    final providerPlaceId = json['providerPlaceId'] as String?;
    final savedAtRaw = json['savedAt'] as String?;

    if (id == null || id.trim().isEmpty) {
      throw const FormatException('SavedParkingRef requires a non-empty id');
    }
    final effectivePlaceId = providerPlaceId != null && providerPlaceId.trim().isNotEmpty
        ? providerPlaceId.trim()
        : (id.contains(':') ? id.split(':').sublist(1).join(':') : id);

    final savedAt = savedAtRaw != null
        ? DateTime.tryParse(savedAtRaw)?.toUtc() ?? DateTime.now().toUtc()
        : DateTime.now().toUtc();

    return SavedParkingRef(
      id: id.trim(),
      provider: provider.trim(),
      providerPlaceId: effectivePlaceId,
      savedAt: savedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'provider': provider,
      'providerPlaceId': providerPlaceId,
      'savedAt': savedAt.toIso8601String(),
    };
  }

  SavedParkingRef copyWith({
    String? id,
    String? provider,
    String? providerPlaceId,
    DateTime? savedAt,
  }) {
    return SavedParkingRef(
      id: id ?? this.id,
      provider: provider ?? this.provider,
      providerPlaceId: providerPlaceId ?? this.providerPlaceId,
      savedAt: savedAt ?? this.savedAt,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SavedParkingRef &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;
}
