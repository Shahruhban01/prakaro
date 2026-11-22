import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../data/parking_remote_data_source.dart';
import '../data/parking_repository_impl.dart';
import '../domain/parking_location.dart';
import '../domain/parking_repository.dart';
import '../domain/parking_verification.dart';
import '../domain/recent_search.dart';
import '../domain/destination_search_models.dart';
import 'saved_providers.dart';

/// Provider for Parking Remote Data Source.
final parkingRemoteDataSourceProvider = Provider<ParkingRemoteDataSource>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ParkingRemoteDataSourceImpl(apiClient);
});

/// Provider for Parking Repository.
final parkingRepositoryProvider = Provider<ParkingRepository>((ref) {
  final remoteDataSource = ref.watch(parkingRemoteDataSourceProvider);
  return ParkingRepositoryImpl(remoteDataSource);
});

/// Visual presentation mode for the parking feature.
enum ParkingViewMode {
  list,
  map,
}

/// Active pricing filter selection.
enum PricingFilter {
  all,
  free,
  paid,
}

/// Lifecycle and discovery states of the parking screen.
enum ParkingMapStatus {
  initializing,
  locationPermissionRequired,
  locationUnavailable,
  loading,
  loaded,
  empty,
  backendUnavailable,
  error,
}

/// Immutable logical search query representation for deterministic request identity and coalescing.
class ParkingSearchQuery {
  const ParkingSearchQuery({
    required this.latitude,
    required this.longitude,
    required this.radiusMeters,
  });

  final double latitude;
  final double longitude;
  final int radiusMeters;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ParkingSearchQuery &&
          runtimeType == other.runtimeType &&
          (latitude - other.latitude).abs() < 0.0001 &&
          (longitude - other.longitude).abs() < 0.0001 &&
          radiusMeters == other.radiusMeters;

  @override
  int get hashCode => Object.hash(
        (latitude * 10000).round(),
        (longitude * 10000).round(),
        radiusMeters,
      );

  @override
  String toString() =>
      'ParkingSearchQuery(lat: $latitude, lng: $longitude, radius: $radiusMeters)';
}

/// Pairing of a parking location with its computed straight-line distance.
class ParkingLocationWithDistance {
  const ParkingLocationWithDistance({
    required this.location,
    this.distanceMeters,
  });

  final ParkingLocation location;
  final double? distanceMeters;
}

/// State representation for parking discovery across list and map views.
class ParkingMapState {
  const ParkingMapState({
    this.viewMode = ParkingViewMode.list,
    this.status = ParkingMapStatus.initializing,
    this.isRefreshing = false,
    this.userLatitude,
    this.userLongitude,
    this.searchCenterLatitude,
    this.searchCenterLongitude,
    this.isCustomSearchArea = false,
    this.cameraLatitude,
    this.cameraLongitude,
    this.lastSearchedLatitude,
    this.lastSearchedLongitude,
    this.radiusMeters = defaultRadiusMeters,
    this.locations = const [],
    this.discoverySettings = const ParkingDiscoverySettings(),
    this.discoveryMode,
    this.selectedLocation,
    this.errorMessage,
    this.canSearchArea = false,
    this.pricingFilter = PricingFilter.all,
    this.openNowFilter = false,
    this.publicAccessFilter = false,
    this.displayedQuery,
    this.lastSuccessfulFetchTime,
    this.isStaleResults = false,
    this.staleNotice,
    this.isOffline = false,
    this.isTimedOut = false,
    this.isRateLimited = false,
    this.destinationName,
    this.searchOriginType = SearchOriginType.currentLocation,
  });

  static const List<int> supportedRadiiMeters = [1000, 3000, 5000];
  static const int defaultRadiusMeters = 3000;

  final ParkingViewMode viewMode;
  final ParkingMapStatus status;
  final bool isRefreshing;
  final double? userLatitude;
  final double? userLongitude;
  final double? searchCenterLatitude;
  final double? searchCenterLongitude;
  final bool isCustomSearchArea;
  final double? cameraLatitude;
  final double? cameraLongitude;
  final double? lastSearchedLatitude;
  final double? lastSearchedLongitude;
  final int radiusMeters;
  final List<ParkingLocation> locations;
  final ParkingDiscoverySettings discoverySettings;
  final ParkingDiscoveryMode? discoveryMode;
  final ParkingLocation? selectedLocation;
  final String? errorMessage;
  final bool canSearchArea;
  final PricingFilter pricingFilter;
  final bool openNowFilter;
  final bool publicAccessFilter;

  // Milestone 08 Performance, Reliability & Lifecycle fields
  final ParkingSearchQuery? displayedQuery;
  final DateTime? lastSuccessfulFetchTime;
  final bool isStaleResults;
  final String? staleNotice;
  final bool isOffline;
  final bool isTimedOut;
  final bool isRateLimited;

  // Milestone 10 Destination search fields
  final String? destinationName;
  final SearchOriginType searchOriginType;

  bool get isLoading =>
      status == ParkingMapStatus.initializing || status == ParkingMapStatus.loading;

  /// True if any non-default filter is currently applied.
  bool get isAnyFilterActive =>
      pricingFilter != PricingFilter.all || openNowFilter || publicAccessFilter;

  /// Number of active non-default filters.
  int get activeFilterCount =>
      (pricingFilter != PricingFilter.all ? 1 : 0) +
      (openNowFilter ? 1 : 0) +
      (publicAccessFilter ? 1 : 0);

  /// Radius in kilometers as a clean integer (1, 3, 5).
  int get searchRadiusKm => (radiusMeters / 1000).round();

  /// Whether user can increase the search radius to a larger tier (< 5 km).
  bool get canIncreaseRadius => radiusMeters < 5000;

  /// Next larger supported radius in meters.
  int get nextRadiusMeters {
    if (radiusMeters < 3000) return 3000;
    if (radiusMeters < 5000) return 5000;
    return 5000;
  }

  /// Compact headline context for list header.
  String get searchContextTitle {
    if (searchOriginType == SearchOriginType.destination && destinationName != null) {
      return 'Near $destinationName';
    }
    return isCustomSearchArea ? 'Selected map area' : 'Parking near you';
  }

  /// Primary search area description badge/subtitle.
  String get searchContextLabel {
    if (searchOriginType == SearchOriginType.destination && destinationName != null) {
      return 'Within $searchRadiusKm km of $destinationName';
    }
    return isCustomSearchArea
        ? 'Within $searchRadiusKm km of selected map area'
        : 'Within $searchRadiusKm km of your location';
  }

  /// Reference label explaining distance baseline.
  String get distanceReferenceNote =>
      (isCustomSearchArea && userLatitude == null)
          ? 'from search center'
          : 'straight-line';

  bool get verificationAvailable => discoverySettings.available && !isStaleResults &&
      !locations.any((loc) => loc.verification?.isCurrent == false);

  ParkingDiscoveryMode get effectiveDiscoveryMode {
    final requested = discoveryMode ?? discoverySettings.defaultMode;
    if (!verificationAvailable ||
        (requested == ParkingDiscoveryMode.verifiedOnly && !discoverySettings.filteringEnabled)) {
      return ParkingDiscoveryMode.allCandidates;
    }
    return requested;
  }

  bool get isVerifiedEmpty => !isLoading &&
      (status == ParkingMapStatus.empty || status == ParkingMapStatus.loaded) &&
      effectiveDiscoveryMode == ParkingDiscoveryMode.verifiedOnly &&
      filteredLocations.isEmpty;

  /// Applies the current filters, keeping nearest-first unless Recommended is selected.
  List<ParkingLocationWithDistance> get filteredLocationsWithDistance {
    final mode = effectiveDiscoveryMode;
    final useIndependentFilters = verificationAvailable && discoverySettings.filteringEnabled;
    final filtered = locations.where((loc) {
      final verification = loc.verification;
      if (mode == ParkingDiscoveryMode.verifiedOnly && verification?.isVerified != true) {
        return false;
      }
      final independentPrice = useIndependentFilters ? verification?.pricing : null;
      final free = independentPrice == 'FREE' || (independentPrice != 'PAID' && loc.isConfirmedFree);
      final paid = independentPrice == 'PAID' || (independentPrice != 'FREE' && loc.isConfirmedPaid);
      if (pricingFilter == PricingFilter.free && !free) {
        return false;
      }
      if (pricingFilter == PricingFilter.paid && !paid) {
        return false;
      }
      if (openNowFilter && !loc.isConfirmedOpen) {
        return false;
      }
      final public = useIndependentFilters && verification != null
          ? verification.access == 'PUBLIC' : loc.isConfirmedPublic;
      if (publicAccessFilter && !public) {
        return false;
      }
      return true;
    });

    // 2. Attach straight-line distance: prefer user's real GPS position,
    // otherwise fallback to search center if user GPS is not available.
    final refLat = userLatitude ?? searchCenterLatitude;
    final refLng = userLongitude ?? searchCenterLongitude;

    final list = filtered.map((loc) {
      double? dist;
      if (refLat != null && refLng != null) {
        dist = Geolocator.distanceBetween(
          refLat,
          refLng,
          loc.latitude,
          loc.longitude,
        );
      }
      return ParkingLocationWithDistance(location: loc, distanceMeters: dist);
    }).toList();

    // 3. Nearest first sorting with stable tie-breaker
    if (mode == ParkingDiscoveryMode.recommended || (refLat != null && refLng != null)) {
      list.sort((a, b) {
        if (mode == ParkingDiscoveryMode.recommended) {
          final order = discoverySettings.recommendedOrder;
          final rank = (order[a.location.id] ?? order.length).compareTo(order[b.location.id] ?? order.length);
          if (rank != 0) return rank;
        }
        if (a.distanceMeters == null && b.distanceMeters == null) {
          return a.location.id.compareTo(b.location.id);
        }
        if (a.distanceMeters == null) return 1;
        if (b.distanceMeters == null) return -1;
        final cmp = a.distanceMeters!.compareTo(b.distanceMeters!);
        if (cmp != 0) return cmp;
        return a.location.id.compareTo(b.location.id);
      });
    }

    return list;
  }

  /// Returns filtered locations without distance wrappers.
  List<ParkingLocation> get filteredLocations =>
      filteredLocationsWithDistance.map((item) => item.location).toList();

  /// Backward-compatible alias for filtered locations with straight-line distance.
  List<ParkingLocationWithDistance> get sortedLocationsWithDistance =>
      filteredLocationsWithDistance;

  /// Backward-compatible alias for sorted locations list.
  List<ParkingLocation> get nearestLocations => filteredLocations;

  /// True when backend loaded facilities, but active filter criteria matched 0 facilities.
  bool get isFilterEmpty =>
      status == ParkingMapStatus.loaded &&
      locations.isNotEmpty &&
      filteredLocations.isEmpty;

  /// Formats straight-line distance in a human-readable format.
  static String formatDistance(double? meters) {
    if (meters == null) return 'Distance unavailable';
    if (meters < 1000) {
      return '${meters.round()} m';
    }
    final km = meters / 1000;
    return '${km.toStringAsFixed(1)} km';
  }

  /// Compact formatted label indicating straight-line approximation.
  static String formatDistanceLabel(double? meters) {
    if (meters == null) return 'Distance unavailable';
    return '${formatDistance(meters)} away (straight-line)';
  }

  ParkingMapState copyWith({
    ParkingViewMode? viewMode,
    ParkingMapStatus? status,
    bool? isRefreshing,
    double? userLatitude,
    double? userLongitude,
    double? searchCenterLatitude,
    double? searchCenterLongitude,
    bool? isCustomSearchArea,
    double? cameraLatitude,
    double? cameraLongitude,
    double? lastSearchedLatitude,
    double? lastSearchedLongitude,
    int? radiusMeters,
    List<ParkingLocation>? locations,
    ParkingDiscoverySettings? discoverySettings,
    ParkingDiscoveryMode? discoveryMode,
    ParkingLocation? selectedLocation,
    bool clearSelectedLocation = false,
    String? errorMessage,
    bool? canSearchArea,
    PricingFilter? pricingFilter,
    bool? openNowFilter,
    bool? publicAccessFilter,
    ParkingSearchQuery? displayedQuery,
    DateTime? lastSuccessfulFetchTime,
    bool? isStaleResults,
    String? staleNotice,
    bool clearStaleNotice = false,
    bool? isOffline,
    bool? isTimedOut,
    bool? isRateLimited,
    String? destinationName,
    bool clearDestination = false,
    SearchOriginType? searchOriginType,
  }) {
    return ParkingMapState(
      viewMode: viewMode ?? this.viewMode,
      status: status ?? this.status,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      userLatitude: userLatitude ?? this.userLatitude,
      userLongitude: userLongitude ?? this.userLongitude,
      searchCenterLatitude: searchCenterLatitude ?? this.searchCenterLatitude,
      searchCenterLongitude: searchCenterLongitude ?? this.searchCenterLongitude,
      isCustomSearchArea: isCustomSearchArea ?? this.isCustomSearchArea,
      cameraLatitude: cameraLatitude ?? this.cameraLatitude,
      cameraLongitude: cameraLongitude ?? this.cameraLongitude,
      lastSearchedLatitude: lastSearchedLatitude ?? this.lastSearchedLatitude,
      lastSearchedLongitude: lastSearchedLongitude ?? this.lastSearchedLongitude,
      radiusMeters: radiusMeters ?? this.radiusMeters,
      locations: locations ?? this.locations,
      discoverySettings: discoverySettings ?? this.discoverySettings,
      discoveryMode: discoveryMode ?? this.discoveryMode,
      selectedLocation: clearSelectedLocation
          ? null
          : (selectedLocation ?? this.selectedLocation),
      errorMessage: errorMessage ?? this.errorMessage,
      canSearchArea: canSearchArea ?? this.canSearchArea,
      pricingFilter: pricingFilter ?? this.pricingFilter,
      openNowFilter: openNowFilter ?? this.openNowFilter,
      publicAccessFilter: publicAccessFilter ?? this.publicAccessFilter,
      displayedQuery: displayedQuery ?? this.displayedQuery,
      lastSuccessfulFetchTime:
          lastSuccessfulFetchTime ?? this.lastSuccessfulFetchTime,
      isStaleResults: isStaleResults ?? this.isStaleResults,
      staleNotice:
          clearStaleNotice ? null : (staleNotice ?? this.staleNotice),
      isOffline: isOffline ?? this.isOffline,
      isTimedOut: isTimedOut ?? this.isTimedOut,
      isRateLimited: isRateLimited ?? this.isRateLimited,
      destinationName: clearDestination ? null : (destinationName ?? this.destinationName),
      searchOriginType: searchOriginType ?? this.searchOriginType,
    );
  }
}

/// Notifier managing parking discovery lifecycle, view switching, and state.
class ParkingMapNotifier extends Notifier<ParkingMapState> {
  LocationService get locationService => ref.read(locationServiceProvider);
  ParkingRepository get parkingRepository => ref.read(parkingRepositoryProvider);

  int _searchRequestId = 0;
  CancelToken? _activeCancelToken;
  Timer? _debounceTimer;
  Timer? _verificationExpiryTimer;

  // In-flight request coalescing (prevents duplicate identical active queries)
  ParkingSearchQuery? _inFlightQuery;
  Future<ParkingDiscoveryResult>? _inFlightSearchFuture;

  @override
  ParkingMapState build() {
    ref.onDispose(() {
      _debounceTimer?.cancel();
      _verificationExpiryTimer?.cancel();
      _activeCancelToken?.cancel('Notifier disposed');
    });
    return const ParkingMapState();
  }

  void setDiscoveryMode(ParkingDiscoveryMode mode) {
    if (mode == ParkingDiscoveryMode.verifiedOnly && !state.discoverySettings.filteringEnabled) return;
    state = state.copyWith(discoveryMode: mode);
    final selected = state.selectedLocation;
    if (selected != null && !state.filteredLocations.contains(selected)) {
      state = state.copyWith(clearSelectedLocation: true);
    }
  }

  void _scheduleVerificationExpiry(List<ParkingLocation> locations) {
    _verificationExpiryTimer?.cancel();
    final now = DateTime.now();
    final expiries = locations.map((location) => location.verification?.validUntil)
        .whereType<DateTime>().where((expiry) => expiry.isAfter(now)).toList()..sort();
    if (expiries.isEmpty) return;
    _verificationExpiryTimer = Timer(expiries.first.difference(now), () {
      if (!ref.mounted) return;
      state = state.copyWith();
      _scheduleVerificationExpiry(state.locations);
    });
  }

  /// Switch the active presentation mode between list and map without re-fetching data.
  void setViewMode(ParkingViewMode mode) {
    if (!ref.mounted) return;
    if (state.viewMode == mode) return;
    AppHaptics.selection();
    state = state.copyWith(viewMode: mode);
  }

  /// Sets search radius (1000m, 3000m, 5000m) with 350ms debouncing for rapid changes.
  Future<void> setRadius(int radiusMeters) async {
    if (!ref.mounted) return;
    if (state.radiusMeters == radiusMeters) return; // Prevent duplicate requests
    if (!ParkingMapState.supportedRadiiMeters.contains(radiusMeters)) return;

    AppHaptics.selection();

    // Cancel any previous debounced timer
    _debounceTimer?.cancel();

    // Immediately update UI state so radius selector & map circle reflect selection
    state = state.copyWith(radiusMeters: radiusMeters);

    // Debounce the actual backend query by 350ms to coalesce rapid user switching
    _debounceTimer = Timer(const Duration(milliseconds: 350), () async {
      if (!ref.mounted) return;

      final targetLat = state.searchCenterLatitude ?? state.userLatitude;
      final targetLng = state.searchCenterLongitude ?? state.userLongitude;

      if (targetLat != null && targetLng != null) {
        await searchNearby(
          latitude: targetLat,
          longitude: targetLng,
          radius: radiusMeters,
        );
      } else {
        await init(force: true);
      }
    });
  }

  /// Convenience method to step up radius to next tier (e.g. 1km -> 3km, 3km -> 5km).
  Future<void> increaseRadius() async {
    if (state.canIncreaseRadius) {
      await setRadius(state.nextRadiusMeters);
    }
  }

  /// Resets search center back to device GPS location and re-queries (bypasses debounce).
  Future<void> searchNearUser() async {
    if (!ref.mounted) return;
    _debounceTimer?.cancel();
    AppHaptics.lightImpact();

    final userLat = state.userLatitude;
    final userLng = state.userLongitude;

    if (userLat != null && userLng != null) {
      state = state.copyWith(
        isCustomSearchArea: false,
        clearDestination: true,
        searchOriginType: SearchOriginType.currentLocation,
      );
      await searchNearby(
        latitude: userLat,
        longitude: userLng,
        radius: state.radiusMeters,
      );
    } else {
      state = state.copyWith(
        isCustomSearchArea: false,
        clearDestination: true,
        searchOriginType: SearchOriginType.currentLocation,
      );
      await init(force: true);
    }
  }

  /// Sets search center to a resolved destination (e.g. Connaught Place) and discovers parking.
  Future<void> searchDestination({
    required double latitude,
    required double longitude,
    required String destinationName,
  }) async {
    if (!ref.mounted) return;
    _debounceTimer?.cancel();
    AppHaptics.lightImpact();

    state = state.copyWith(
      searchCenterLatitude: latitude,
      searchCenterLongitude: longitude,
      cameraLatitude: latitude,
      cameraLongitude: longitude,
      isCustomSearchArea: true,
      destinationName: destinationName,
      searchOriginType: SearchOriginType.destination,
    );

    await searchNearby(
      latitude: latitude,
      longitude: longitude,
      radius: state.radiusMeters,
    );
  }

  /// Clears active destination and restores search to GPS location.
  Future<void> clearDestination() async {
    await searchNearUser();
  }

  /// Sets pricing filter (mutually exclusive free / paid / all). Local filter, no network call.
  void setPricingFilter(PricingFilter filter) {
    if (!ref.mounted) return;
    if (state.pricingFilter == filter) return;
    AppHaptics.selection();
    state = state.copyWith(pricingFilter: filter);
  }

  /// Toggles the 'Open Now' filter. Local filter, no network call.
  void toggleOpenNow() {
    if (!ref.mounted) return;
    AppHaptics.selection();
    state = state.copyWith(openNowFilter: !state.openNowFilter);
  }

  /// Toggles the 'Public Access' filter. Local filter, no network call.
  void togglePublicAccess() {
    if (!ref.mounted) return;
    AppHaptics.selection();
    state = state.copyWith(publicAccessFilter: !state.publicAccessFilter);
  }

  /// Clears all active filters back to 'All' while strictly preserving selected radius.
  void clearFilters() {
    if (!ref.mounted) return;
    AppHaptics.lightImpact();
    state = state.copyWith(
      pricingFilter: PricingFilter.all,
      openNowFilter: false,
      publicAccessFilter: false,
    );
  }

  /// Bootstrap GPS position and search initial nearby parking.
  Future<void> init({bool force = false}) async {
    if (!ref.mounted) return;
    if (!force &&
        (state.status == ParkingMapStatus.loading ||
            state.status == ParkingMapStatus.loaded)) {
      return;
    }

    _debounceTimer?.cancel();
    state = state.copyWith(status: ParkingMapStatus.initializing);

    final locationResult = await locationService.getCurrentLocation();
    if (!ref.mounted) return;

    switch (locationResult) {
      case LocationSuccess(:final latitude, :final longitude):
        state = state.copyWith(
          userLatitude: latitude,
          userLongitude: longitude,
          searchCenterLatitude: latitude,
          searchCenterLongitude: longitude,
          isCustomSearchArea: false,
          cameraLatitude: latitude,
          cameraLongitude: longitude,
        );
        await searchNearby(latitude: latitude, longitude: longitude);

      case LocationFailure(:final reason, :final message):
        if (reason == LocationFailureReason.permissionDenied ||
            reason == LocationFailureReason.permissionPermanentlyDenied) {
          state = state.copyWith(
            status: ParkingMapStatus.locationPermissionRequired,
            errorMessage: message,
          );
        } else {
          state = state.copyWith(
            status: ParkingMapStatus.locationUnavailable,
            errorMessage: message,
          );
        }
    }
  }

  /// Pull-to-refresh or user-triggered refresh of parking results (bypasses debounce).
  Future<void> refresh() async {
    _debounceTimer?.cancel();
    AppHaptics.lightImpact();
    final targetLat = state.searchCenterLatitude ?? state.userLatitude;
    final targetLng = state.searchCenterLongitude ?? state.userLongitude;

    if (targetLat != null && targetLng != null) {
      await searchNearby(
        latitude: targetLat,
        longitude: targetLng,
        radius: state.radiusMeters,
        isRefresh: true,
      );
    } else {
      await init(force: true);
    }
  }

  /// Queries the Prakaro backend for parking locations near the provided coordinates.
  ///
  /// Incorporates:
  /// - Dio CancelToken request cancellation for superseded searches.
  /// - In-flight query coalescing to prevent duplicate simultaneous requests.
  /// - Stale-response protection using generation tokens & ParkingSearchQuery identity.
  /// - Stale-result indication when refresh fails for the same query area.
  Future<void> searchNearby({
    required double latitude,
    required double longitude,
    int? radius,
    bool isRefresh = false,
  }) async {
    if (!ref.mounted) return;

    final effectiveRadius = radius ?? state.radiusMeters;
    final targetQuery = ParkingSearchQuery(
      latitude: latitude,
      longitude: longitude,
      radiusMeters: effectiveRadius,
    );

    // Cancel any pending debounced search
    _debounceTimer?.cancel();

    // 1. In-flight Request Coalescing (Duplicate Prevention)
    if (_inFlightQuery != null &&
        _inFlightQuery == targetQuery &&
        _inFlightSearchFuture != null) {
      try {
        await _inFlightSearchFuture;
      } catch (_) {
        // Handled by the original in-flight search caller
      }
      return;
    }

    // 2. Cancel superseded active network request
    if (_activeCancelToken != null && !_activeCancelToken!.isCancelled) {
      _activeCancelToken!.cancel('Superseded by new parking search');
    }
    final cancelToken = CancelToken();
    _activeCancelToken = cancelToken;

    final requestId = ++_searchRequestId;

    // Retain existing locations during pull-to-refresh to prevent UI jump
    if (isRefresh && state.locations.isNotEmpty) {
      state = state.copyWith(
        isRefreshing: true,
        canSearchArea: false,
        searchCenterLatitude: latitude,
        searchCenterLongitude: longitude,
        lastSearchedLatitude: latitude,
        lastSearchedLongitude: longitude,
        radiusMeters: effectiveRadius,
      );
    } else {
      state = state.copyWith(
        status: ParkingMapStatus.loading,
        isRefreshing: false,
        canSearchArea: false,
        searchCenterLatitude: latitude,
        searchCenterLongitude: longitude,
        lastSearchedLatitude: latitude,
        lastSearchedLongitude: longitude,
        radiusMeters: effectiveRadius,
        clearSelectedLocation: true,
      );
    }

    _inFlightQuery = targetQuery;
    final repository = parkingRepository;
    final searchFuture = repository is ParkingDiscoveryRepository
        ? repository.discoverParking(userSearch: !isRefresh, latitude: latitude, longitude: longitude, radius: effectiveRadius, cancelToken: cancelToken)
        : repository.getNearbyParking(latitude: latitude, longitude: longitude, radius: effectiveRadius, cancelToken: cancelToken)
            .then(ParkingDiscoveryResult.new);
    _inFlightSearchFuture = searchFuture;

    try {
      final discovery = await searchFuture;
      final results = discovery.locations;

      // Stale-response guard: ignore older response if a newer request started
      if (!ref.mounted || requestId != _searchRequestId) return;

      _scheduleVerificationExpiry(results);
      if (results.isEmpty) {
        state = state.copyWith(
          status: ParkingMapStatus.empty,
          isRefreshing: false,
          locations: const [],
          discoverySettings: discovery.settings,
          displayedQuery: targetQuery,
          lastSuccessfulFetchTime: DateTime.now(),
          isStaleResults: false,
          clearStaleNotice: true,
          isOffline: false,
          isTimedOut: false,
          isRateLimited: false,
        );
      } else {
        state = state.copyWith(
          status: ParkingMapStatus.loaded,
          isRefreshing: false,
          locations: results,
          discoverySettings: discovery.settings,
          displayedQuery: targetQuery,
          lastSuccessfulFetchTime: DateTime.now(),
          isStaleResults: false,
          clearStaleNotice: true,
          isOffline: false,
          isTimedOut: false,
          isRateLimited: false,
        );
      }
    } on RequestCancelledException {
      // Cancellation is an expected control-flow event, do not update state with error
      return;
    } on NetworkException catch (e) {
      if (!ref.mounted || requestId != _searchRequestId) return;

      final isOffline = e is OfflineException;
      final isTimeout = e is NetworkTimeoutException;
      final isRateLimit = e is RateLimitException;
      final isBackendUnreachable = isOffline ||
          isTimeout ||
          isRateLimit ||
          e.statusCode == null ||
          e.statusCode == 503 ||
          e.statusCode == 502 ||
          e.statusCode == 504;

      final isSameQuery =
          state.displayedQuery != null && state.displayedQuery == targetQuery;

      // Stale result preservation: keep previous results visible on same-query refresh failure
      if (isRefresh && state.locations.isNotEmpty && isSameQuery) {
        state = state.copyWith(
          isRefreshing: false,
          isStaleResults: true,
          staleNotice: 'Showing previous results. Refresh to try again.',
          errorMessage: e.message,
          isOffline: isOffline,
          isTimedOut: isTimeout,
          isRateLimited: isRateLimit,
        );
      } else {
        // New search failure (different location/radius): do not mislabel old results
        state = state.copyWith(
          status: isBackendUnreachable
              ? ParkingMapStatus.backendUnavailable
              : ParkingMapStatus.error,
          isRefreshing: false,
          locations: const [],
          isStaleResults: false,
          clearStaleNotice: true,
          errorMessage: e.message,
          isOffline: isOffline,
          isTimedOut: isTimeout,
          isRateLimited: isRateLimit,
        );
      }
    } catch (e) {
      if (!ref.mounted || requestId != _searchRequestId) return;
      if (e is RequestCancelledException) return;

      final isSameQuery =
          state.displayedQuery != null && state.displayedQuery == targetQuery;
      if (isRefresh && state.locations.isNotEmpty && isSameQuery) {
        state = state.copyWith(
          isRefreshing: false,
          isStaleResults: true,
          staleNotice: 'Showing previous results. Refresh to try again.',
        );
      } else {
        state = state.copyWith(
          status: ParkingMapStatus.error,
          isRefreshing: false,
          locations: const [],
          isStaleResults: false,
          clearStaleNotice: true,
          errorMessage: 'An unexpected error occurred while searching for parking.',
        );
      }
    } finally {
      if (_inFlightQuery == targetQuery) {
        _inFlightQuery = null;
        _inFlightSearchFuture = null;
      }
    }
  }

  /// Triggers a parking search centered around current camera target coordinates (bypasses debounce).
  Future<void> searchCurrentArea() async {
    _debounceTimer?.cancel();
    final lat = state.cameraLatitude ?? state.searchCenterLatitude ?? state.userLatitude;
    final lng = state.cameraLongitude ?? state.searchCenterLongitude ?? state.userLongitude;

    if (lat != null && lng != null) {
      state = state.copyWith(
        isCustomSearchArea: true,
        canSearchArea: false,
      );

      // Record user-initiated explicit search area if recording is enabled
      ref.read(recentSearchesProvider.notifier).recordSearch(
        latitude: lat,
        longitude: lng,
        radiusMeters: state.radiusMeters,
        originType: RecentSearchOriginType.explicitAreaSearch,
      );

      await searchNearby(
        latitude: lat,
        longitude: lng,
        radius: state.radiusMeters,
      );
    }
  }

  /// Restores a recent search origin and radius, triggering a fresh backend search.
  Future<void> searchFromRecent({
    required double latitude,
    required double longitude,
    required int radiusMeters,
  }) async {
    _debounceTimer?.cancel();
    state = state.copyWith(
      radiusMeters: radiusMeters,
      cameraLatitude: latitude,
      cameraLongitude: longitude,
      searchCenterLatitude: latitude,
      searchCenterLongitude: longitude,
      isCustomSearchArea: true,
      canSearchArea: false,
    );

    // Refresh timestamp of reused search if recording is active
    ref.read(recentSearchesProvider.notifier).recordSearch(
      latitude: latitude,
      longitude: longitude,
      radiusMeters: radiusMeters,
      originType: RecentSearchOriginType.customSearchCenter,
    );

    await searchNearby(
      latitude: latitude,
      longitude: longitude,
      radius: radiusMeters,
    );
  }

  /// Invoked when the user pans/zooms the map camera and movement ends.
  void onCameraIdle(double centerLat, double centerLng) {
    if (!ref.mounted) return;
    state = state.copyWith(
      cameraLatitude: centerLat,
      cameraLongitude: centerLng,
    );

    final lastLat = state.lastSearchedLatitude;
    final lastLng = state.lastSearchedLongitude;

    if (lastLat != null && lastLng != null) {
      final distance = Geolocator.distanceBetween(
        lastLat,
        lastLng,
        centerLat,
        centerLng,
      );

      // Show "Search this area" button if center shifted more than 350 meters
      if (distance > 350) {
        state = state.copyWith(canSearchArea: true);
      }
    }
  }

  /// Selects a specific parking location to highlight and inspect.
  void selectLocation(ParkingLocation? location) {
    if (!ref.mounted) return;
    state = state.copyWith(
      selectedLocation: location,
      clearSelectedLocation: location == null,
    );
  }

  /// Calculates straight-line distance in meters between user position and facility.
  double? getDistanceTo(ParkingLocation location) {
    final refLat = state.userLatitude ?? state.searchCenterLatitude;
    final refLng = state.userLongitude ?? state.searchCenterLongitude;
    if (refLat == null || refLng == null) return null;

    return Geolocator.distanceBetween(
      refLat,
      refLng,
      location.latitude,
      location.longitude,
    );
  }
}

/// Provider for ParkingMapNotifier (shared across List and Map views).
final parkingMapProvider =
    NotifierProvider<ParkingMapNotifier, ParkingMapState>(
  ParkingMapNotifier.new,
);
