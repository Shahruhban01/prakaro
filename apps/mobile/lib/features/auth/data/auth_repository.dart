import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/secure_storage_service.dart';
import '../domain/user.dart';
import 'auth_remote_data_source.dart';

/// Provider for the Auth Repository.
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final remoteDataSource = ref.watch(authRemoteDataSourceProvider);
  final secureStorage = ref.watch(secureStorageServiceProvider);
  return AuthRepository(remoteDataSource, secureStorage);
});

/// Repository managing user authentication lifecycle and persistent credentials.
class AuthRepository {
  const AuthRepository(this._remoteDataSource, this._secureStorage);

  final AuthRemoteDataSource _remoteDataSource;
  final SecureStorageService _secureStorage;

  /// Bootstrap and verify session on application startup.
  Future<({AppUser? user, String? token, UserPreferences preferences})> checkSession() async {
    final token = await _secureStorage.getAuthToken();
    if (token == null || token.isEmpty) {
      return (user: null, token: null, preferences: const UserPreferences());
    }

    try {
      final sessionData = await _remoteDataSource.getSession();
      if (sessionData != null && sessionData['user'] is Map<String, dynamic>) {
        final user = AppUser.fromJson(sessionData['user'] as Map<String, dynamic>);
        await _secureStorage.saveCachedUserJson(jsonEncode(user.toJson()));

        // Fetch preferences
        UserPreferences prefs = const UserPreferences();
        try {
          prefs = await _remoteDataSource.getPreferences();
        } catch (_) {}

        return (user: user, token: token, preferences: prefs);
      }
    } catch (_) {
      // If network is offline, attempt to restore cached user
      final cachedJson = await _secureStorage.getCachedUserJson();
      if (cachedJson != null && cachedJson.isNotEmpty) {
        try {
          final decoded = jsonDecode(cachedJson) as Map<String, dynamic>;
          final user = AppUser.fromJson(decoded);
          return (user: user, token: token, preferences: const UserPreferences());
        } catch (_) {}
      }
    }

    // Token is invalid/expired
    await _secureStorage.clearAll();
    return (user: null, token: null, preferences: const UserPreferences());
  }

  /// Sign up user with name, email, and password.
  Future<({AppUser user, String token, UserPreferences preferences})> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    final data = await _remoteDataSource.signUp(
      name: name,
      email: email,
      password: password,
    );

    final token = data['token']?.toString() ?? '';
    final userJson = data['user'] as Map<String, dynamic>? ?? {};
    final user = AppUser.fromJson(userJson);

    if (token.isNotEmpty) {
      await _secureStorage.saveAuthToken(token);
      await _secureStorage.saveCachedUserJson(jsonEncode(user.toJson()));
    }

    UserPreferences prefs = const UserPreferences();
    try {
      prefs = await _remoteDataSource.getPreferences();
    } catch (_) {}

    return (user: user, token: token, preferences: prefs);
  }

  /// Sign in user with email and password.
  Future<({AppUser user, String token, UserPreferences preferences})> signIn({
    required String email,
    required String password,
  }) async {
    final data = await _remoteDataSource.signIn(
      email: email,
      password: password,
    );

    final token = data['token']?.toString() ?? '';
    final userJson = data['user'] as Map<String, dynamic>? ?? {};
    final user = AppUser.fromJson(userJson);

    if (token.isNotEmpty) {
      await _secureStorage.saveAuthToken(token);
      await _secureStorage.saveCachedUserJson(jsonEncode(user.toJson()));
    }

    UserPreferences prefs = const UserPreferences();
    try {
      prefs = await _remoteDataSource.getPreferences();
    } catch (_) {}

    return (user: user, token: token, preferences: prefs);
  }

  /// Sign out current user.
  Future<void> signOut() async {
    await _remoteDataSource.signOut();
    await _secureStorage.clearAll();
  }

  /// Update user preferences.
  Future<UserPreferences> updatePreferences({
    bool? recentSearchEnabled,
    int? defaultRadiusMeters,
  }) async {
    return await _remoteDataSource.updatePreferences(
      recentSearchEnabled: recentSearchEnabled,
      defaultRadiusMeters: defaultRadiusMeters,
    );
  }

  /// Permanently delete account and clear local storage.
  Future<bool> deleteAccount() async {
    final success = await _remoteDataSource.deleteAccount();
    if (success) {
      await _secureStorage.clearAll();
    }
    return success;
  }
}
