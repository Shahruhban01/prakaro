import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Provider for the secure storage service.
final secureStorageServiceProvider = Provider<SecureStorageService>((ref) {
  return const SecureStorageService();
});

/// Service encapsulating encrypted device storage for sensitive auth tokens.
class SecureStorageService {
  const SecureStorageService([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const String _keyAuthToken = 'prakaro_auth_bearer_token';
  static const String _keyCachedUser = 'prakaro_cached_user_json';

  Future<String?> getAuthToken() async {
    try {
      return await _storage.read(key: _keyAuthToken);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveAuthToken(String token) async {
    try {
      await _storage.write(key: _keyAuthToken, value: token);
    } catch (_) {}
  }

  Future<void> clearAuthToken() async {
    try {
      await _storage.delete(key: _keyAuthToken);
    } catch (_) {}
  }

  Future<String?> getCachedUserJson() async {
    try {
      return await _storage.read(key: _keyCachedUser);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveCachedUserJson(String jsonStr) async {
    try {
      await _storage.write(key: _keyCachedUser, value: jsonStr);
    } catch (_) {}
  }

  Future<void> clearAll() async {
    try {
      await _storage.deleteAll();
    } catch (_) {}
  }
}
