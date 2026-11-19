import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/destination_search_models.dart';

/// Provider for the Places Remote Data Source.
final placesRemoteDataSourceProvider = Provider<PlacesRemoteDataSource>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PlacesRemoteDataSource(apiClient);
});

/// Remote data source communicating with Prakaro backend Places API
/// (Google Places Autocomplete New and Place Details New proxy).
class PlacesRemoteDataSource {
  const PlacesRemoteDataSource(this._client);

  final ApiClient _client;

  /// Fetch autocomplete suggestions for destination query.
  Future<List<DestinationSuggestion>> getAutocompleteSuggestions({
    required String input,
    required String sessionToken,
    CancelToken? cancelToken,
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/places/autocomplete',
      data: {
        'input': input.trim(),
        'sessionToken': sessionToken,
      },
      cancelToken: cancelToken,
    );

    final rawList = response.data?['data'];
    if (rawList is List) {
      return rawList
          .whereType<Map<String, dynamic>>()
          .map(DestinationSuggestion.fromJson)
          .toList();
    }
    return [];
  }

  /// Resolve placeId to geographic coordinates and address, concluding the autocomplete session.
  Future<ResolvedDestination?> resolveDestination({
    required String placeId,
    required String sessionToken,
    CancelToken? cancelToken,
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/places/resolve',
      data: {
        'placeId': placeId.trim(),
        'sessionToken': sessionToken,
      },
      cancelToken: cancelToken,
    );

    final data = response.data?['data'];
    if (data is Map<String, dynamic>) {
      return ResolvedDestination.fromJson(data);
    }
    return null;
  }
}
