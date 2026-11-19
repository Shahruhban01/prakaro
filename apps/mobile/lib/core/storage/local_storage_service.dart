import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/parking/domain/recent_search.dart';
import '../../features/parking/domain/saved_parking_ref.dart';

/// Provider for Local Storage Service.
final localStorageServiceProvider = Provider<LocalStorageService>((ref) {
  return SharedPrefsLocalStorageService();
});

/// Contract for persistent local client storage.
///
/// Encapsulates all SharedPreferences operations and strictly adheres to
/// Google Maps Platform compliance (storing only references and user preferences).
abstract class LocalStorageService {
  Future<List<SavedParkingRef>> getSavedParkingRefs();
  Future<bool> saveParkingRef(SavedParkingRef ref);
  Future<bool> removeParkingRef(String id);
  Future<bool> clearAllSavedParkingRefs();

  Future<bool> isRecentSearchRecordingEnabled();
  Future<bool> setRecentSearchRecordingEnabled(bool enabled);
  Future<List<RecentSearch>> getRecentSearches();
  Future<bool> saveRecentSearch(RecentSearch search);
  Future<bool> removeRecentSearch(String id);
  Future<bool> clearAllRecentSearches();
}

/// SharedPreferences-backed implementation of [LocalStorageService].
class SharedPrefsLocalStorageService implements LocalStorageService {
  SharedPrefsLocalStorageService([this._providedPrefs]);

  final SharedPreferences? _providedPrefs;

  static const String keyStorageVersion = 'prakaro_storage_version';
  static const int currentStorageVersion = 1;

  static const String keySavedRefs = 'prakaro_saved_parking_refs';
  static const String keyRecentSearches = 'prakaro_recent_searches';
  static const String keyRecentSearchEnabled = 'prakaro_recent_search_recording_enabled';

  static const int maxRecentSearches = 15;

  Future<SharedPreferences> _getPrefs() async {
    return _providedPrefs ?? await SharedPreferences.getInstance();
  }

  @override
  Future<List<SavedParkingRef>> getSavedParkingRefs() async {
    try {
      final prefs = await _getPrefs();
      final raw = prefs.getString(keySavedRefs);
      if (raw == null || raw.trim().isEmpty) {
        return const [];
      }

      final dynamic decoded = jsonDecode(raw);
      if (decoded is! List) {
        return const [];
      }

      final List<SavedParkingRef> list = [];
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          try {
            list.add(SavedParkingRef.fromJson(item));
          } catch (_) {
            // Skip individually corrupted or incompatible records gracefully
          }
        }
      }
      return list;
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<bool> saveParkingRef(SavedParkingRef ref) async {
    try {
      final prefs = await _getPrefs();
      final current = await getSavedParkingRefs();

      // Deduplicate: remove if existing ID is already present
      final updated = current.where((item) => item.id != ref.id).toList();
      // Prepend the new/updated ref to the top
      updated.insert(0, ref);

      final encoded = jsonEncode(updated.map((item) => item.toJson()).toList());
      await prefs.setInt(keyStorageVersion, currentStorageVersion);
      return await prefs.setString(keySavedRefs, encoded);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> removeParkingRef(String id) async {
    try {
      final prefs = await _getPrefs();
      final current = await getSavedParkingRefs();
      final updated = current.where((item) => item.id != id).toList();

      final encoded = jsonEncode(updated.map((item) => item.toJson()).toList());
      return await prefs.setString(keySavedRefs, encoded);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> clearAllSavedParkingRefs() async {
    try {
      final prefs = await _getPrefs();
      return await prefs.remove(keySavedRefs);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> isRecentSearchRecordingEnabled() async {
    try {
      final prefs = await _getPrefs();
      // Disabled by default for user privacy
      return prefs.getBool(keyRecentSearchEnabled) ?? false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> setRecentSearchRecordingEnabled(bool enabled) async {
    try {
      final prefs = await _getPrefs();
      return await prefs.setBool(keyRecentSearchEnabled, enabled);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<RecentSearch>> getRecentSearches() async {
    try {
      final prefs = await _getPrefs();
      final raw = prefs.getString(keyRecentSearches);
      if (raw == null || raw.trim().isEmpty) {
        return const [];
      }

      final dynamic decoded = jsonDecode(raw);
      if (decoded is! List) {
        return const [];
      }

      final List<RecentSearch> list = [];
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          try {
            list.add(RecentSearch.fromJson(item));
          } catch (_) {
            // Ignore malformed item safely
          }
        }
      }
      return list;
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<bool> saveRecentSearch(RecentSearch search) async {
    try {
      final isEnabled = await isRecentSearchRecordingEnabled();
      if (!isEnabled) {
        return false;
      }

      final prefs = await _getPrefs();
      final current = await getRecentSearches();

      // Deduplicate: if an entry within close distance exists, replace it
      final updated = current.where((item) => item.id != search.id).toList();
      updated.insert(0, search);

      // Bound collection size to prevent unbounded local storage growth
      final bounded = updated.take(maxRecentSearches).toList();

      final encoded = jsonEncode(bounded.map((item) => item.toJson()).toList());
      await prefs.setInt(keyStorageVersion, currentStorageVersion);
      return await prefs.setString(keyRecentSearches, encoded);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> removeRecentSearch(String id) async {
    try {
      final prefs = await _getPrefs();
      final current = await getRecentSearches();
      final updated = current.where((item) => item.id != id).toList();

      final encoded = jsonEncode(updated.map((item) => item.toJson()).toList());
      return await prefs.setString(keyRecentSearches, encoded);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> clearAllRecentSearches() async {
    try {
      final prefs = await _getPrefs();
      return await prefs.remove(keyRecentSearches);
    } catch (_) {
      return false;
    }
  }
}
