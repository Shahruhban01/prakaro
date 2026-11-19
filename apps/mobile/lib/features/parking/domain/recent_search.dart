/// Origin types for explicit user-initiated searches.
enum RecentSearchOriginType {
  explicitAreaSearch,
  customSearchCenter,
}

/// Represents an explicit user-initiated search area.
///
/// Privacy principles:
/// - Only explicit user actions ("Search This Area", custom centers) are recorded.
/// - Never automatic GPS bootstraps, map panning, or radius adjustments.
/// - Neutral display label ("Previously searched area"), never fictional names.
/// - History recording is DISABLED by default until the user explicitly opts in.
class RecentSearch {
  const RecentSearch({
    required this.id,
    required this.latitude,
    required this.longitude,
    required this.radiusMeters,
    required this.createdAt,
    this.originType = RecentSearchOriginType.explicitAreaSearch,
    this.label = 'Previously searched area',
  });

  final String id;
  final double latitude;
  final double longitude;
  final int radiusMeters;
  final DateTime createdAt;
  final RecentSearchOriginType originType;
  final String label;

  factory RecentSearch.create({
    required double latitude,
    required double longitude,
    required int radiusMeters,
    RecentSearchOriginType originType = RecentSearchOriginType.explicitAreaSearch,
  }) {
    // Generate deterministic id based on lat/lng/radius grid to facilitate deduplication
    final latRounded = (latitude * 1000).round();
    final lngRounded = (longitude * 1000).round();
    final id = 'search_${latRounded}_${lngRounded}_$radiusMeters';

    return RecentSearch(
      id: id,
      latitude: latitude,
      longitude: longitude,
      radiusMeters: radiusMeters,
      createdAt: DateTime.now().toUtc(),
      originType: originType,
      label: 'Previously searched area',
    );
  }

  factory RecentSearch.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String?;
    final lat = (json['latitude'] as num?)?.toDouble();
    final lng = (json['longitude'] as num?)?.toDouble();
    final radius = (json['radiusMeters'] as num?)?.toInt();
    final createdAtRaw = json['createdAt'] as String?;
    final originTypeStr = json['originType'] as String?;
    final label = json['label'] as String? ?? 'Previously searched area';

    if (id == null || lat == null || lng == null || radius == null) {
      throw const FormatException('Invalid RecentSearch JSON format');
    }

    final createdAt = createdAtRaw != null
        ? DateTime.tryParse(createdAtRaw)?.toUtc() ?? DateTime.now().toUtc()
        : DateTime.now().toUtc();

    final originType = originTypeStr == 'customSearchCenter'
        ? RecentSearchOriginType.customSearchCenter
        : RecentSearchOriginType.explicitAreaSearch;

    return RecentSearch(
      id: id,
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
      createdAt: createdAt,
      originType: originType,
      label: label,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'latitude': latitude,
      'longitude': longitude,
      'radiusMeters': radiusMeters,
      'createdAt': createdAt.toIso8601String(),
      'originType': originType.name,
      'label': label,
    };
  }

  RecentSearch copyWith({
    String? id,
    double? latitude,
    double? longitude,
    int? radiusMeters,
    DateTime? createdAt,
    RecentSearchOriginType? originType,
    String? label,
  }) {
    return RecentSearch(
      id: id ?? this.id,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      radiusMeters: radiusMeters ?? this.radiusMeters,
      createdAt: createdAt ?? this.createdAt,
      originType: originType ?? this.originType,
      label: label ?? this.label,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RecentSearch &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;
}
