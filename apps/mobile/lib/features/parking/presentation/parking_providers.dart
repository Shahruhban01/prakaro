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
    this.cameraLatitude,
    this.cameraLongitude,
    this.lastSearchedLatitude,
    this.lastSearchedLongitude,
    this.radiusMeters = 3000,
    this.locations = const [],
    this.selectedLocation,
    this.errorMessage,
    this.canSearchArea = false,
    this.pricingFilter = PricingFilter.all,
    this.openNowFilter = false,
    this.publicAccessFilter = false,
  });

  final ParkingViewMode viewMode;
  final ParkingMapStatus status;
  final bool isRefreshing;
  final double? userLatitude;
  final double? userLongitude;
  final double? cameraLatitude;
  final double? cameraLongitude;
  final double? lastSearchedLatitude;
  final double? lastSearchedLongitude;
  final int radiusMeters;
  final List<ParkingLocation> locations;
  final ParkingLocation? selectedLocation;
  final String? errorMessage;
  final bool canSearchArea;
  final PricingFilter pricingFilter;
  final bool openNowFilter;
  final bool publicAccessFilter;

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

  /// Returns parking locations matching active filters, sorted by ascending straight-line distance.
  List<ParkingLocationWithDistance> get filteredLocationsWithDistance {
    // 1. Filter candidate facilities
    final filtered = locations.where((loc) {
      if (pricingFilter == PricingFilter.free && !loc.isConfirmedFree) {
        return false;
      }
      if (pricingFilter == PricingFilter.paid && !loc.isConfirmedPaid) {
        return false;
      }
      if (openNowFilter && !loc.isConfirmedOpen) {
        return false;
      }
      if (publicAccessFilter && !loc.isConfirmedPublic) {
        return false;
      }
      return true;
    });

    // 2. Attach straight-line distance
    final list = filtered.map((loc) {
      double? dist;
      if (userLatitude != null && userLongitude != null) {
        dist = Geolocator.distanceBetween(
          userLatitude!,
          userLongitude!,
          loc.latitude,
          loc.longitude,
        );
      }
      return ParkingLocationWithDistance(location: loc, distanceMeters: dist);
    }).toList();

    // 3. Nearest first sorting with stable tie-breaker
    if (userLatitude != null && userLongitude != null) {
      list.sort((a, b) {
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
    double? cameraLatitude,
    double? cameraLongitude,
    double? lastSearchedLatitude,
    double? lastSearchedLongitude,
    int? radiusMeters,
    List<ParkingLocation>? locations,
    ParkingLocation? selectedLocation,
    bool clearSelectedLocation = false,
    String? errorMessage,
    bool? canSearchArea,
    PricingFilter? pricingFilter,
    bool? openNowFilter,
    bool? publicAccessFilter,
  }) {
    return ParkingMapState(
      viewMode: viewMode ?? this.viewMode,
      status: status ?? this.status,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      userLatitude: userLatitude ?? this.userLatitude,
      userLongitude: userLongitude ?? this.userLongitude,
      cameraLatitude: cameraLatitude ?? this.cameraLatitude,
      cameraLongitude: cameraLongitude ?? this.cameraLongitude,
      lastSearchedLatitude: lastSearchedLatitude ?? this.lastSearchedLatitude,
      lastSearchedLongitude: lastSearchedLongitude ?? this.lastSearchedLongitude,
      radiusMeters: radiusMeters ?? this.radiusMeters,
      locations: locations ?? this.locations,
      selectedLocation: clearSelectedLocation
          ? null
          : (selectedLocation ?? this.selectedLocation),
      errorMessage: errorMessage ?? this.errorMessage,
      canSearchArea: canSearchArea ?? this.canSearchArea,
      pricingFilter: pricingFilter ?? this.pricingFilter,
      openNowFilter: openNowFilter ?? this.openNowFilter,
      publicAccessFilter: publicAccessFilter ?? this.publicAccessFilter,
    );
  }
}

/// Notifier managing parking discovery lifecycle, view switching, and state.
class ParkingMapNotifier extends Notifier<ParkingMapState> {
  LocationService get locationService => ref.read(locationServiceProvider);
  ParkingRepository get parkingRepository => ref.read(parkingRepositoryProvider);

  @override
  ParkingMapState build() {
    return const ParkingMapState();
  }

  /// Switch the active presentation mode between list and map without re-fetching data.
  void setViewMode(ParkingViewMode mode) {
    if (!ref.mounted) return;
    if (state.viewMode == mode) return;
    AppHaptics.selection();
    state = state.copyWith(viewMode: mode);
  }

  /// Sets pricing filter (mutually exclusive free / paid / all).
  void setPricingFilter(PricingFilter filter) {
    if (!ref.mounted) return;
    if (state.pricingFilter == filter) return;
    AppHaptics.selection();
    state = state.copyWith(pricingFilter: filter);
  }

  /// Toggles the 'Open Now' filter.
  void toggleOpenNow() {
    if (!ref.mounted) return;
    AppHaptics.selection();
    state = state.copyWith(openNowFilter: !state.openNowFilter);
  }

  /// Toggles the 'Public Access' filter.
  void togglePublicAccess() {
    if (!ref.mounted) return;
    AppHaptics.selection();
    state = state.copyWith(publicAccessFilter: !state.publicAccessFilter);
  }

  /// Clears all active filters back to 'All'.
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

    state = state.copyWith(status: ParkingMapStatus.initializing);

    final locationResult = await locationService.getCurrentLocation();
    if (!ref.mounted) return;

    switch (locationResult) {
      case LocationSuccess(:final latitude, :final longitude):
        state = state.copyWith(
          userLatitude: latitude,
          userLongitude: longitude,
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

  /// Pull-to-refresh or user-triggered refresh of parking results.
  Future<void> refresh() async {
    AppHaptics.lightImpact();
    final userLat = state.userLatitude;
    final userLng = state.userLongitude;

    if (userLat != null && userLng != null) {
      await searchNearby(
        latitude: userLat,
        longitude: userLng,
        isRefresh: true,
      );
    } else {
      await init(force: true);
    }
  }

  /// Queries the Prakaro backend for parking locations near the provided coordinates.
  Future<void> searchNearby({
    required double latitude,
    required double longitude,
    int? radius,
    bool isRefresh = false,
  }) async {
    if (!ref.mounted) return;
    final effectiveRadius = radius ?? state.radiusMeters;

    // Retain existing locations during pull-to-refresh to prevent UI jump
    if (isRefresh && state.locations.isNotEmpty) {
      state = state.copyWith(
        isRefreshing: true,
        canSearchArea: false,
        lastSearchedLatitude: latitude,
        lastSearchedLongitude: longitude,
        radiusMeters: effectiveRadius,
      );
    } else {
      state = state.copyWith(
        status: ParkingMapStatus.loading,
        isRefreshing: false,
        canSearchArea: false,
        lastSearchedLatitude: latitude,
        lastSearchedLongitude: longitude,
        radiusMeters: effectiveRadius,
        clearSelectedLocation: true,
      );
    }

    try {
      final results = await parkingRepository.getNearbyParking(
        latitude: latitude,
        longitude: longitude,
        radius: effectiveRadius,
      );

      if (!ref.mounted) return;

      if (results.isEmpty) {
        state = state.copyWith(
          status: ParkingMapStatus.empty,
          isRefreshing: false,
          locations: const [],
        );
      } else {
        state = state.copyWith(
          status: ParkingMapStatus.loaded,
          isRefreshing: false,
          locations: results,
        );
      }
    } on NetworkException catch (e) {
      if (!ref.mounted) return;
      final isBackendUnreachable = e.statusCode == null ||
          e.statusCode == 503 ||
          e.statusCode == 502 ||
          e.statusCode == 504;

      if (isRefresh && state.locations.isNotEmpty) {
        state = state.copyWith(
          isRefreshing: false,
          errorMessage: e.message,
        );
      } else {
        state = state.copyWith(
          status: isBackendUnreachable
              ? ParkingMapStatus.backendUnavailable
              : ParkingMapStatus.error,
          isRefreshing: false,
          errorMessage: e.message,
        );
      }
    } catch (e) {
      if (!ref.mounted) return;
      if (isRefresh && state.locations.isNotEmpty) {
        state = state.copyWith(isRefreshing: false);
      } else {
        state = state.copyWith(
          status: ParkingMapStatus.error,
          isRefreshing: false,
          errorMessage: 'An unexpected error occurred while searching for parking.',
        );
      }
    }
  }

  /// Triggers a parking search centered around current camera target coordinates.
  Future<void> searchCurrentArea() async {
    final lat = state.cameraLatitude ?? state.userLatitude;
    final lng = state.cameraLongitude ?? state.userLongitude;

    if (lat != null && lng != null) {
      await searchNearby(latitude: lat, longitude: lng);
    }
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
    final userLat = state.userLatitude;
    final userLng = state.userLongitude;
    if (userLat == null || userLng == null) return null;

    return Geolocator.distanceBetween(
      userLat,
      userLng,
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
