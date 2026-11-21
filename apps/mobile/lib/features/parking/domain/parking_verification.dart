enum ParkingDiscoveryMode {
  recommended,
  verifiedOnly,
  allCandidates;

  static ParkingDiscoveryMode fromJson(Object? value) => switch (value) {
    'RECOMMENDED' => recommended,
    'VERIFIED_ONLY' => verifiedOnly,
    _ => allCandidates,
  };
}

class ParkingDiscoverySettings {
  const ParkingDiscoverySettings({
    this.displayEnabled = false,
    this.available = false,
    this.filteringEnabled = false,
    this.defaultMode = ParkingDiscoveryMode.allCandidates,
    this.recommendedOrder = const {},
  });

  final bool displayEnabled;
  final bool available;
  final bool filteringEnabled;
  final ParkingDiscoveryMode defaultMode;
  final Map<String, int> recommendedOrder;

  factory ParkingDiscoverySettings.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return const ParkingDiscoverySettings();
    final order = value['recommendedOrder'];
    final ids = order is List
        ? order.whereType<String>().take(20).toList()
        : const <String>[];
    return ParkingDiscoverySettings(
      displayEnabled: true,
      available: value['available'] == true,
      filteringEnabled: value['filteringEnabled'] == true,
      defaultMode: ParkingDiscoveryMode.fromJson(value['defaultMode']),
      recommendedOrder: Map.unmodifiable({
        for (var index = 0; index < ids.length; index++) ids[index]: index,
      }),
    );
  }
}

enum ParkingFacilityStatus { verified, supported, unconfirmed, contradicted }

class ParkingVerification {
  const ParkingVerification({
    required this.status,
    this.access = 'UNKNOWN',
    this.pricing = 'UNKNOWN',
    this.reasonCodes = const [],
    this.validUntil,
  });

  final ParkingFacilityStatus status;
  final String access;
  final String pricing;
  final List<String> reasonCodes;
  final DateTime? validUntil;

  bool get isCurrent =>
      validUntil?.isAfter(DateTime.now()) ??
      status != ParkingFacilityStatus.verified;
  bool get isVerified => isCurrent && status == ParkingFacilityStatus.verified;
  bool get isUnavailable =>
      !isCurrent || reasonCodes.contains('VERIFICATION_UNAVAILABLE');
  bool get isRestricted =>
      isCurrent &&
      const ['PRIVATE', 'CUSTOMERS_ONLY', 'RESTRICTED'].contains(access);

  String get label {
    if (isUnavailable) return 'Information unavailable';
    return switch (status) {
      ParkingFacilityStatus.verified => 'Verified parking',
      ParkingFacilityStatus.supported => 'Parking supported by evidence',
      ParkingFacilityStatus.unconfirmed => 'Unconfirmed',
      ParkingFacilityStatus.contradicted => 'Parking classification disputed',
    };
  }

  static ParkingVerification? fromJson(Object? value) {
    if (value is! Map<String, dynamic>) return null;
    final status = switch (value['facilityStatus']) {
      'INDEPENDENTLY_VERIFIED' => ParkingFacilityStatus.verified,
      'STRONGLY_SUPPORTED' => ParkingFacilityStatus.supported,
      'CONTRADICTED' => ParkingFacilityStatus.contradicted,
      _ => ParkingFacilityStatus.unconfirmed,
    };
    final access = value['access'];
    final pricing = value['pricing'];
    final codes = value['reasonCodes'];
    final expiry = value['validUntil'];
    return ParkingVerification(
      status: status,
      access: access is String ? access : 'UNKNOWN',
      pricing: pricing is String ? pricing : 'UNKNOWN',
      reasonCodes: List.unmodifiable(
        codes is List ? codes.whereType<String>() : const <String>[],
      ),
      validUntil: expiry is String ? DateTime.tryParse(expiry) : null,
    );
  }
}
