import 'package:dio/dio.dart';

import 'parking_location.dart';
import 'parking_photo.dart';

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
