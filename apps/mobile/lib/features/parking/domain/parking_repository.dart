import 'package:dio/dio.dart';

import 'parking_location.dart';
import 'parking_photo.dart';
import 'parking_verification.dart';

class ParkingDiscoveryResult {
  const ParkingDiscoveryResult(this.locations, [this.settings = const ParkingDiscoverySettings()]);

  final List<ParkingLocation> locations;
  final ParkingDiscoverySettings settings;
}

abstract interface class ParkingDiscoveryRepository implements ParkingRepository {
  Future<ParkingDiscoveryResult> discoverParking({
    required double latitude,
    required double longitude,
    int? radius,
    bool userSearch = false,
    CancelToken? cancelToken,
  });
}

/// Contract for discovering parking facilities and visual facility details.
abstract class ParkingRepository {
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  });

  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  });

  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  });
}
