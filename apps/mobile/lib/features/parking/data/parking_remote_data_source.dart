import '../../../core/errors/app_exception.dart';
import '../../../core/network/api_client.dart';
import 'parking_location_dto.dart';

abstract class ParkingRemoteDataSource {
  Future<List<ParkingLocationDto>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
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
  }) async {
    final queryParams = <String, dynamic>{
      'latitude': latitude,
      'longitude': longitude,
    };
    if (radius != null) {
      queryParams['radius'] = radius;
    }

    final response = await _apiClient.get<Map<String, dynamic>>(
      '/api/v1/parking/nearby',
      queryParameters: queryParams,
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

    return facilities;
  }
}
