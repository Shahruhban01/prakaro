import 'package:dio/dio.dart';

import 'parking_location.dart';

/// Contract for discovering parking facilities.
abstract class ParkingRepository {
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  });
}
