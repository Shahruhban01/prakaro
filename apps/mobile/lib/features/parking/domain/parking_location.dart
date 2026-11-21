import 'parking_verification.dart';

/// Pricing classification for a parking facility.
enum PricingType {
  free,
  paid,
  mixed,
  unknown;

  static PricingType fromString(String? val) {
    switch (val?.trim().toLowerCase()) {
      case 'free':
        return PricingType.free;
      case 'paid':
        return PricingType.paid;
      case 'mixed':
        return PricingType.mixed;
      default:
        return PricingType.unknown;
    }
  }
}

/// Operational opening status of a parking facility.
enum OpeningStatus {
  open,
  closed,
  unknown;

  static OpeningStatus fromString(String? val) {
    switch (val?.trim().toLowerCase()) {
      case 'open':
        return OpeningStatus.open;
      case 'closed':
        return OpeningStatus.closed;
      default:
        return OpeningStatus.unknown;
    }
  }
}

/// Access entitlement classification.
enum AccessType {
  public,
  customersOnly,
  private,
  unknown;

  static AccessType fromString(String? val) {
    switch (val?.trim().toLowerCase()) {
      case 'public':
        return AccessType.public;
      case 'customers_only':
      case 'customers-only':
        return AccessType.customersOnly;
      case 'private':
        return AccessType.private;
      default:
        return AccessType.unknown;
    }
  }
}

/// Ownership classification.
enum OwnershipType {
  public,
  private,
  unknown;

  static OwnershipType fromString(String? val) {
    switch (val?.trim().toLowerCase()) {
      case 'public':
        return OwnershipType.public;
      case 'private':
        return OwnershipType.private;
      default:
        return OwnershipType.unknown;
    }
  }
}

/// Specific parking options supported by the facility.
class ParkingOptions {
  const ParkingOptions({
    this.freeParkingLot,
    this.paidParkingLot,
    this.freeStreetParking,
    this.paidStreetParking,
    this.freeGarageParking,
    this.paidGarageParking,
  });

  final bool? freeParkingLot;
  final bool? paidParkingLot;
  final bool? freeStreetParking;
  final bool? paidStreetParking;
  final bool? freeGarageParking;
  final bool? paidGarageParking;

  static const ParkingOptions empty = ParkingOptions();

  factory ParkingOptions.fromJson(Map<String, dynamic>? json) {
    if (json == null) return empty;
    return ParkingOptions(
      freeParkingLot: json['freeParkingLot'] as bool?,
      paidParkingLot: json['paidParkingLot'] as bool?,
      freeStreetParking: json['freeStreetParking'] as bool?,
      paidStreetParking: json['paidStreetParking'] as bool?,
      freeGarageParking: json['freeGarageParking'] as bool?,
      paidGarageParking: json['paidGarageParking'] as bool?,
    );
  }

  Map<String, dynamic> toJson() => {
        'freeParkingLot': freeParkingLot,
        'paidParkingLot': paidParkingLot,
        'freeStreetParking': freeStreetParking,
        'paidStreetParking': paidStreetParking,
        'freeGarageParking': freeGarageParking,
        'paidGarageParking': paidGarageParking,
      };
}

/// Domain entity representing a parking facility.
class ParkingLocation {
  const ParkingLocation({
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
    this.verification,
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
  final ParkingVerification? verification;

  /// True if facility is verified to offer free parking (including mixed).
  bool get isConfirmedFree =>
      pricingType == PricingType.free || pricingType == PricingType.mixed;

  /// True if facility is verified to require payment (including mixed).
  bool get isConfirmedPaid =>
      pricingType == PricingType.paid || pricingType == PricingType.mixed;

  /// True if facility is verified to be currently open.
  bool get isConfirmedOpen => openingStatus == OpeningStatus.open;

  /// True if facility is verified to be currently closed.
  bool get isConfirmedClosed => openingStatus == OpeningStatus.closed;

  /// True if facility is verified to have public access.
  bool get isConfirmedPublic => accessType == AccessType.public;

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
      'ParkingLocation(id: $id, name: $name, lat: $latitude, lng: $longitude, pricing: $pricingType, open: $openingStatus)';
}
