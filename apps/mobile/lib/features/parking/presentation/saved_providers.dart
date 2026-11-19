import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/storage/local_storage_service.dart';
import '../domain/parking_location.dart';
import '../domain/parking_repository.dart';
import '../domain/recent_search.dart';
import '../domain/saved_parking_ref.dart';
import 'parking_providers.dart';

/// Notifier controlling the root application tab (0 = Explore, 1 = Saved).
class RootNavigationIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void setIndex(int index) {
    state = index;
  }
}

/// Provider controlling the root application tab (0 = Explore, 1 = Saved).
final rootNavigationIndexProvider =
    NotifierProvider<RootNavigationIndexNotifier, int>(RootNavigationIndexNotifier.new);

/// Status of an on-demand resolved saved parking facility.
enum SavedItemStatus {
  loading,
  loaded,
  notFound,
  offline,
  timeout,
  rateLimited,
  error,
}

/// Representation of an on-demand resolved saved facility record.
class SavedItemResolution {
  const SavedItemResolution({
    required this.id,
    required this.status,
    this.location,
    this.errorMessage,
  });

  final String id;
  final SavedItemStatus status;
  final ParkingLocation? location;
  final String? errorMessage;

  SavedItemResolution copyWith({
    String? id,
    SavedItemStatus? status,
    ParkingLocation? location,
    String? errorMessage,
  }) {
    return SavedItemResolution(
      id: id ?? this.id,
      status: status ?? this.status,
      location: location ?? this.location,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

/// State of the on-demand saved facility resolver.
class SavedFacilityResolverState {
  const SavedFacilityResolverState({
    this.items = const {},
  });

  final Map<String, SavedItemResolution> items;

  SavedFacilityResolverState copyWith({
    Map<String, SavedItemResolution>? items,
  }) {
    return SavedFacilityResolverState(
      items: items ?? this.items,
    );
  }
}

/// Notifier managing on-demand Place Details resolution with bounded concurrency,
/// deduplication, and honest error handling.
class SavedFacilityResolverNotifier extends Notifier<SavedFacilityResolverState> {
  ParkingRepository get _repository => ref.read(parkingRepositoryProvider);
  final Set<String> _inFlightIds = {};

  @override
  SavedFacilityResolverState build() {
    return const SavedFacilityResolverState();
  }

  /// Caches a known ParkingLocation directly (e.g. from search results) without triggering network requests.
  void cacheKnownLocation(ParkingLocation location) {
    final updated = Map<String, SavedItemResolution>.from(state.items);
    updated[location.id] = SavedItemResolution(
      id: location.id,
      status: SavedItemStatus.loaded,
      location: location,
    );
    state = state.copyWith(items: updated);
  }

  /// Resolves an array of saved references on-demand with bounded concurrency.
  Future<void> resolveAll(List<SavedParkingRef> refs, {int maxConcurrency = 3}) async {
    final toResolve = refs.where((r) {
      final existing = state.items[r.id];
      if (existing == null) return true;
      return existing.status == SavedItemStatus.error ||
          existing.status == SavedItemStatus.offline ||
          existing.status == SavedItemStatus.timeout;
    }).toList();

    if (toResolve.isEmpty) return;

    // Process items in chunks of maxConcurrency to protect mobile CPU & API quotas
    for (int i = 0; i < toResolve.length; i += maxConcurrency) {
      final end = (i + maxConcurrency < toResolve.length) ? i + maxConcurrency : toResolve.length;
      final chunk = toResolve.sublist(i, end);
      await Future.wait(chunk.map((ref) => resolveSingle(ref.id)));
    }
  }

  /// Resolves a single saved parking facility through the backend.
  Future<void> resolveSingle(String id, {bool force = false}) async {
    final existing = state.items[id];
    if (!force && existing != null && existing.status == SavedItemStatus.loaded) {
      return;
    }

    if (_inFlightIds.contains(id)) {
      return;
    }

    _inFlightIds.add(id);

    // Set loading state
    final loadingMap = Map<String, SavedItemResolution>.from(state.items);
    loadingMap[id] = SavedItemResolution(
      id: id,
      status: SavedItemStatus.loading,
      location: existing?.location,
    );
    state = state.copyWith(items: loadingMap);

    try {
      final location = await _repository.getParkingDetails(id);
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);

      if (location != null) {
        updatedMap[id] = SavedItemResolution(
          id: id,
          status: SavedItemStatus.loaded,
          location: location,
        );
      } else {
        updatedMap[id] = SavedItemResolution(
          id: id,
          status: SavedItemStatus.notFound,
          errorMessage: 'Facility no longer available.',
        );
      }
      state = state.copyWith(items: updatedMap);
    } on NotFoundException catch (e) {
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);
      updatedMap[id] = SavedItemResolution(
        id: id,
        status: SavedItemStatus.notFound,
        errorMessage: e.message,
      );
      state = state.copyWith(items: updatedMap);
    } on OfflineException catch (_) {
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);
      updatedMap[id] = SavedItemResolution(
        id: id,
        status: SavedItemStatus.offline,
        errorMessage: 'Connect to the internet to load parking details.',
      );
      state = state.copyWith(items: updatedMap);
    } on NetworkTimeoutException catch (e) {
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);
      updatedMap[id] = SavedItemResolution(
        id: id,
        status: SavedItemStatus.timeout,
        errorMessage: e.message,
      );
      state = state.copyWith(items: updatedMap);
    } on RateLimitException catch (e) {
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);
      updatedMap[id] = SavedItemResolution(
        id: id,
        status: SavedItemStatus.rateLimited,
        errorMessage: e.message,
      );
      state = state.copyWith(items: updatedMap);
    } catch (_) {
      final updatedMap = Map<String, SavedItemResolution>.from(state.items);
      updatedMap[id] = SavedItemResolution(
        id: id,
        status: SavedItemStatus.error,
        errorMessage: 'Could not load facility details.',
      );
      state = state.copyWith(items: updatedMap);
    } finally {
      _inFlightIds.remove(id);
    }
  }

  void remove(String id) {
    final updated = Map<String, SavedItemResolution>.from(state.items)..remove(id);
    state = state.copyWith(items: updated);
  }

  void clearAll() {
    state = const SavedFacilityResolverState();
  }
}

/// Provider for on-demand saved facility resolver.
final savedFacilityResolverProvider =
    NotifierProvider<SavedFacilityResolverNotifier, SavedFacilityResolverState>(
  SavedFacilityResolverNotifier.new,
);

/// Notifier managing user-saved parking references.
class SavedParkingRefsNotifier extends Notifier<List<SavedParkingRef>> {
  LocalStorageService get _storage => ref.read(localStorageServiceProvider);
  bool _initialized = false;

  @override
  List<SavedParkingRef> build() {
    _loadInitialRefs();
    return const [];
  }

  Future<void> _loadInitialRefs() async {
    final refs = await _storage.getSavedParkingRefs();
    if (ref.mounted && !_initialized) {
      _initialized = true;
      final merged = [
        ...state,
        ...refs.where((r) => !state.any((s) => s.id == r.id)),
      ];
      state = merged;
    }
  }

  /// Toggles saving of a facility.
  ///
  /// Returns `true` if saved, `false` if removed.
  Future<bool> toggleSave(ParkingLocation location) async {
    _initialized = true;
    final exists = isSaved(location.id);
    if (exists) {
      await remove(location.id);
      return false;
    } else {
      final newRef = SavedParkingRef.fromParkingLocation(
        locationId: location.id,
        source: location.source,
      );
      // Optimistic update
      final previous = state;
      state = [newRef, ...state.where((r) => r.id != location.id)];

      // Cache known location details in memory to avoid Place Details network call
      ref.read(savedFacilityResolverProvider.notifier).cacheKnownLocation(location);

      final ok = await _storage.saveParkingRef(newRef);
      if (!ok) {
        // Rollback on local storage write failure
        state = previous;
        return false;
      }
      return true;
    }
  }

  Future<void> remove(String id) async {
    _initialized = true;
    final previous = state;
    state = state.where((r) => r.id != id).toList();
    ref.read(savedFacilityResolverProvider.notifier).remove(id);

    final ok = await _storage.removeParkingRef(id);
    if (!ok) {
      state = previous;
    }
  }

  Future<void> clearAll() async {
    _initialized = true;
    final previous = state;
    state = const [];
    ref.read(savedFacilityResolverProvider.notifier).clearAll();

    final ok = await _storage.clearAllSavedParkingRefs();
    if (!ok) {
      state = previous;
    }
  }

  bool isSaved(String id) {
    return state.any((r) => r.id == id);
  }
}

/// Provider for the list of saved parking references.
final savedParkingRefsProvider =
    NotifierProvider<SavedParkingRefsNotifier, List<SavedParkingRef>>(
  SavedParkingRefsNotifier.new,
);

/// State of recent searches and privacy recording preferences.
class RecentSearchesState {
  const RecentSearchesState({
    this.isRecordingEnabled = false,
    this.searches = const [],
    this.isLoading = false,
  });

  final bool isRecordingEnabled;
  final List<RecentSearch> searches;
  final bool isLoading;

  RecentSearchesState copyWith({
    bool? isRecordingEnabled,
    List<RecentSearch>? searches,
    bool? isLoading,
  }) {
    return RecentSearchesState(
      isRecordingEnabled: isRecordingEnabled ?? this.isRecordingEnabled,
      searches: searches ?? this.searches,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Notifier managing recent search areas and privacy preferences.
class RecentSearchesNotifier extends Notifier<RecentSearchesState> {
  LocalStorageService get _storage => ref.read(localStorageServiceProvider);
  bool _initialized = false;

  @override
  RecentSearchesState build() {
    _loadInitial();
    return const RecentSearchesState(isLoading: true);
  }

  Future<void> _loadInitial() async {
    final enabled = await _storage.isRecentSearchRecordingEnabled();
    final searches = enabled ? await _storage.getRecentSearches() : const <RecentSearch>[];
    if (ref.mounted && !_initialized) {
      _initialized = true;
      final merged = [
        ...state.searches,
        ...searches.where((s) => !state.searches.any((existing) => existing.id == s.id)),
      ];
      state = state.copyWith(
        isRecordingEnabled: enabled,
        searches: merged,
        isLoading: false,
      );
    }
  }

  Future<void> setRecordingEnabled(bool enabled) async {
    _initialized = true;
    final previous = state;
    state = state.copyWith(isRecordingEnabled: enabled);
    final ok = await _storage.setRecentSearchRecordingEnabled(enabled);
    if (!ok) {
      state = previous;
      return;
    }

    if (enabled) {
      final searches = await _storage.getRecentSearches();
      state = state.copyWith(searches: searches);
    }
  }

  /// Records an explicit user-initiated search (e.g. Search This Area or Recent Reuse).
  ///
  /// Never called on GPS bootstraps, map panning, or radius changes.
  Future<void> recordSearch({
    required double latitude,
    required double longitude,
    required int radiusMeters,
    RecentSearchOriginType originType = RecentSearchOriginType.explicitAreaSearch,
  }) async {
    if (!state.isRecordingEnabled) {
      return;
    }

    _initialized = true;
    final newSearch = RecentSearch.create(
      latitude: latitude,
      longitude: longitude,
      radiusMeters: radiusMeters,
      originType: originType,
    );

    final updated = [
      newSearch,
      ...state.searches.where((s) => s.id != newSearch.id),
    ].take(SharedPrefsLocalStorageService.maxRecentSearches).toList();

    state = state.copyWith(searches: updated);
    await _storage.saveRecentSearch(newSearch);
  }

  Future<void> remove(String id) async {
    _initialized = true;
    final previous = state;
    final updated = state.searches.where((s) => s.id != id).toList();
    state = state.copyWith(searches: updated);

    final ok = await _storage.removeRecentSearch(id);
    if (!ok) {
      state = previous;
    }
  }

  Future<void> clearAll() async {
    _initialized = true;
    final previous = state;
    state = state.copyWith(searches: const []);

    final ok = await _storage.clearAllRecentSearches();
    if (!ok) {
      state = previous;
    }
  }
}

/// Provider for recent searches and privacy preferences.
final recentSearchesProvider =
    NotifierProvider<RecentSearchesNotifier, RecentSearchesState>(
  RecentSearchesNotifier.new,
);
