import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/user.dart';

/// Provider for the Auth Remote Data Source.
final authRemoteDataSourceProvider = Provider<AuthRemoteDataSource>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthRemoteDataSource(apiClient);
});

/// Remote data source communicating with Better Auth and Prakaro User API.
class AuthRemoteDataSource {
  const AuthRemoteDataSource(this._client);

  final ApiClient _client;

  /// Sign up with name, email, and password via Better Auth.
  Future<Map<String, dynamic>> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/auth/sign-up/email',
      data: {
        'name': name.trim(),
        'email': email.trim().toLowerCase(),
        'password': password,
      },
    );
    return response.data ?? {};
  }

  /// Sign in with email and password via Better Auth.
  Future<Map<String, dynamic>> signIn({
    required String email,
    required String password,
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/auth/sign-in/email',
      data: {
        'email': email.trim().toLowerCase(),
        'password': password,
      },
    );
    return response.data ?? {};
  }

  /// Sign out via Better Auth.
  Future<void> signOut() async {
    try {
      await _client.post<dynamic>('/api/auth/sign-out');
    } catch (_) {
      // Ignore network errors on signout to ensure local state can always be cleared
    }
  }

  /// Retrieve current active session via Better Auth.
  Future<Map<String, dynamic>?> getSession() async {
    try {
      final response = await _client.get<Map<String, dynamic>>('/api/auth/get-session');
      return response.data;
    } catch (_) {
      return null;
    }
  }

  /// Retrieve user preferences from Prakaro API.
  Future<UserPreferences> getPreferences() async {
    final response = await _client.get<Map<String, dynamic>>('/api/v1/users/me/preferences');
    final data = response.data?['data'] as Map<String, dynamic>?;
    if (data != null) {
      return UserPreferences.fromJson(data);
    }
    return const UserPreferences();
  }

  /// Update user preferences on Prakaro API.
  Future<UserPreferences> updatePreferences({
    bool? recentSearchEnabled,
    int? defaultRadiusMeters,
  }) async {
    final payload = <String, dynamic>{};
    if (recentSearchEnabled != null) payload['recentSearchEnabled'] = recentSearchEnabled;
    if (defaultRadiusMeters != null) payload['defaultRadiusMeters'] = defaultRadiusMeters;

    final response = await _client.patch<Map<String, dynamic>>(
      '/api/v1/users/me/preferences',
      data: payload,
    );
    final data = response.data?['data'] as Map<String, dynamic>?;
    if (data != null) {
      return UserPreferences.fromJson(data);
    }
    return const UserPreferences();
  }

  /// Permanently delete account and all cloud-synced data.
  Future<bool> deleteAccount() async {
    final response = await _client.delete<Map<String, dynamic>>('/api/v1/users/me');
    return response.data?['success'] == true;
  }

  // --------------------------------------------------------------------------
  // Cloud-Synced Saved Parking
  // --------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> getCloudSavedParking() async {
    final response = await _client.get<Map<String, dynamic>>('/api/v1/users/me/saved-parking');
    final rawList = response.data?['data'];
    if (rawList is List) {
      return rawList.whereType<Map<String, dynamic>>().toList();
    }
    return [];
  }

  Future<Map<String, dynamic>?> saveCloudParking({
    required String providerPlaceId,
    String provider = 'google',
  }) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/users/me/saved-parking',
      data: {
        'providerPlaceId': providerPlaceId,
        'provider': provider,
      },
    );
    return response.data?['data'] as Map<String, dynamic>?;
  }

  Future<bool> deleteCloudSavedParking(String idOrPlaceId) async {
    final response = await _client.delete<Map<String, dynamic>>(
      '/api/v1/users/me/saved-parking/$idOrPlaceId',
    );
    return response.data?['success'] == true;
  }

  // --------------------------------------------------------------------------
  // Cloud-Synced Recent Searches
  // --------------------------------------------------------------------------

  Future<List<Map<String, dynamic>>> getCloudRecentSearches() async {
    final response = await _client.get<Map<String, dynamic>>('/api/v1/users/me/recent-searches');
    final rawList = response.data?['data'];
    if (rawList is List) {
      return rawList.whereType<Map<String, dynamic>>().toList();
    }
    return [];
  }

  Future<Map<String, dynamic>?> createCloudRecentSearch(Map<String, dynamic> data) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/v1/users/me/recent-searches',
      data: data,
    );
    return response.data?['data'] as Map<String, dynamic>?;
  }

  Future<bool> deleteCloudRecentSearch(String id) async {
    final response = await _client.delete<Map<String, dynamic>>(
      '/api/v1/users/me/recent-searches/$id',
    );
    return response.data?['success'] == true;
  }

  Future<bool> clearCloudRecentSearches() async {
    final response = await _client.delete<Map<String, dynamic>>(
      '/api/v1/users/me/recent-searches',
    );
    return response.data?['success'] == true;
  }
}
