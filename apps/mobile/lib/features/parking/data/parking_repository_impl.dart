import 'package:dio/dio.dart';

import '../domain/parking_location.dart';
import '../domain/parking_photo.dart';
import '../domain/parking_repository.dart';
import 'parking_remote_data_source.dart';

class ParkingRepositoryImpl implements ParkingDiscoveryRepository {
  ParkingRepositoryImpl(this._remoteDataSource);

  final ParkingRemoteDataSource _remoteDataSource;

  @override
  Future<ParkingDiscoveryResult> discoverParking({
    required double latitude,
    required double longitude,
    int? radius,
    bool userSearch = false,
    CancelToken? cancelToken,
  }) async {
    final remote = _remoteDataSource;
    if (remote is ParkingRemoteDataSourceImpl) {
      final result = await remote.discoverParking(
        userSearch: userSearch,
        latitude: latitude,
        longitude: longitude,
        radius: radius,
        cancelToken: cancelToken,
      );
      return ParkingDiscoveryResult(
        result.facilities.map((dto) => dto.toDomain()).toList(),
        result.settings,
      );
    }
    return ParkingDiscoveryResult(await getNearbyParking(
      latitude: latitude, longitude: longitude, radius: radius, cancelToken: cancelToken,
    ));
  }

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

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async {
    final dto = await _remoteDataSource.getParkingDetails(
      id,
      cancelToken: cancelToken,
    );
    return dto?.toDomain();
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) {
    return _remoteDataSource.getParkingPhotos(
      id,
      cancelToken: cancelToken,
    );
  }
}
