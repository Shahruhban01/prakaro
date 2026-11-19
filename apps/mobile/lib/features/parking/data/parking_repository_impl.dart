import 'package:dio/dio.dart';

import '../domain/parking_location.dart';
import '../domain/parking_repository.dart';
import 'parking_remote_data_source.dart';

class ParkingRepositoryImpl implements ParkingRepository {
  ParkingRepositoryImpl(this._remoteDataSource);

  final ParkingRemoteDataSource _remoteDataSource;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) async {
    final dtos = await _remoteDataSource.getNearbyParking(
      latitude: latitude,
      longitude: longitude,
      radius: radius,
      cancelToken: cancelToken,
    );
    return dtos.map((dto) => dto.toDomain()).toList();
  }
}
