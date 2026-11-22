import 'package:uuid/uuid.dart';
import 'package:dio/dio.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/network/api_client.dart';
import '../domain/parking_photo.dart';
import '../domain/parking_verification.dart';
import 'parking_location_dto.dart';

abstract class ParkingRemoteDataSource {
  Future<List<ParkingLocationDto>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  });

  Future<ParkingLocationDto?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  });

  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  });

  Future<bool> reportFacility({
    required String placeId,
    required String category,
    CancelToken? cancelToken,
  });
}

class ParkingRemoteDataSourceImpl implements ParkingRemoteDataSource {
  ParkingRemoteDataSourceImpl(this._apiClient);

  final ApiClient _apiClient;

  @override
  Future<List<ParkingLocationDto>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) async => (await discoverParking(
        latitude: latitude,
        longitude: longitude,
        radius: radius,
        cancelToken: cancelToken,
      )).facilities;

  Future<({List<ParkingLocationDto> facilities, ParkingDiscoverySettings settings})> discoverParking({
    required double latitude,
    required double longitude,
    int? radius,
    bool userSearch = false,
    CancelToken? cancelToken,
  }) async {
    final queryParams = <String, dynamic>{
      'latitude': latitude,
      'longitude': longitude,
      'mode': 'ALL_CANDIDATES',
    };
    if (radius != null) {
      queryParams['radius'] = radius;
    }

    final response = await _apiClient.get<Map<String, dynamic>>(
      '/api/v1/parking/nearby',
      queryParameters: queryParams,
      options: userSearch ? Options(headers: {'X-Prakaro-Search': const Uuid().v4()}) : null,
      cancelToken: cancelToken,
    );

    final responseData = response.data;
    if (responseData == null || !responseData.containsKey('data')) {
      throw const AppException(
        message: 'Invalid response format: missing data field',
      );
    }

    final rawList = responseData['data'];
    if (rawList is! List) {
      throw const AppException(
        message: 'Invalid response format: data field must be an array',
      );
    }

    final List<ParkingLocationDto> facilities = [];
    for (final item in rawList) {
      if (item is Map<String, dynamic>) {
        try {
          facilities.add(ParkingLocationDto.fromJson(item));
        } catch (_) {
          // Exclude any individually malformed items safely
        }
      }
    }

    final meta = responseData['meta'];
    return (
      facilities: facilities,
      settings: ParkingDiscoverySettings.fromJson(meta is Map ? meta['intelligence'] : null),
    );
  }

  @override
  Future<ParkingLocationDto?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _apiClient.get<Map<String, dynamic>>(
        '/api/v1/parking/places/$id',
        cancelToken: cancelToken,
      );

      final responseData = response.data;
      if (responseData == null || !responseData.containsKey('data')) {
        return null;
      }

      final raw = responseData['data'];
      if (raw is Map<String, dynamic>) {
        return ParkingLocationDto.fromJson(raw);
      }
      return null;
    } on NotFoundException {
      return null;
    }
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) async {
    try {
      final cleanId = id.startsWith('google:') ? id.substring(7) : id;
      final response = await _apiClient.get<Map<String, dynamic>>(
        '/api/v1/parking/$cleanId/photos',
        cancelToken: cancelToken,
      );

      final responseData = response.data;
      if (responseData == null || !responseData.containsKey('data')) {
        return const [];
      }

      final rawList = responseData['data'];
      if (rawList is! List) {
        return const [];
      }

      final List<ParkingPhoto> photos = [];
      for (final item in rawList) {
        if (item is Map<String, dynamic>) {
          try {
            photos.add(ParkingPhoto.fromJson(item));
          } catch (_) {
            // Skip individually malformed photo records gracefully
          }
        }
      }

      return photos;
    } on NotFoundException {
      return const [];
    }
  }

  @override
  Future<bool> reportFacility({
    required String placeId,
    required String category,
    CancelToken? cancelToken,
  }) async {
    try {
      final cleanId = placeId.startsWith('google:') ? placeId.substring(7) : placeId;
      final response = await _apiClient.post<Map<String, dynamic>>(
        '/api/v1/moderation/reports',
        data: {
          'placeId': cleanId,
          'category': category,
        },
        cancelToken: cancelToken,
      );
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
