import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/screens/profile_screen.dart';
import '../domain/parking_location.dart';
import 'destination_search_screen.dart';
import 'parking_providers.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_filter_bar.dart';
import 'widgets/parking_radius_selector.dart';
import 'widgets/parking_view_switcher.dart';

/// Interactive Google Maps screen presenting parking facilities with markers, filters, radius circle, and gestures.
class ParkingMapScreen extends ConsumerStatefulWidget {
  const ParkingMapScreen({super.key});

  @override
  ConsumerState<ParkingMapScreen> createState() => _ParkingMapScreenState();
}

class _ParkingMapScreenState extends ConsumerState<ParkingMapScreen> {
  GoogleMapController? _mapController;
  CameraPosition? _currentCameraPosition;
  bool _hasCenteredOnUser = false;

  static const LatLng _fallbackLocation = LatLng(12.9716, 77.5946);
  static const double _defaultZoom = 14.5;

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
    final state = ref.read(parkingMapProvider);
    if (state.userLatitude != null && state.userLongitude != null) {
      _animateToPosition(state.userLatitude!, state.userLongitude!);
      _hasCenteredOnUser = true;
    }
  }

  void _animateToPosition(double lat, double lng, {double zoom = _defaultZoom}) {
    _mapController?.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(target: LatLng(lat, lng), zoom: zoom),
      ),
    );
  }

  Set<Marker> _buildMarkers(List<ParkingLocation> locations, ParkingLocation? selected) {
    return locations.map((loc) {
      final isSelected = selected?.id == loc.id;

      double hue = BitmapDescriptor.hueAzure;
      if (isSelected) {
        hue = BitmapDescriptor.hueViolet;
      } else if (loc.isConfirmedFree) {
        hue = BitmapDescriptor.hueGreen;
      }

      return Marker(
        markerId: MarkerId(loc.id),
        position: LatLng(loc.latitude, loc.longitude),
        icon: BitmapDescriptor.defaultMarkerWithHue(hue),
        infoWindow: InfoWindow(
          title: loc.name,
          snippet: loc.address,
        ),
        onTap: () {
          AppHaptics.lightImpact();
          ref.read(parkingMapProvider.notifier).selectLocation(loc);
          _animateToPosition(loc.latitude, loc.longitude, zoom: 16.0);
        },
      );
    }).toSet();
  }

  Set<Circle> _buildCircles(ParkingMapState state, ColorScheme colorScheme) {
    final centerLat = state.lastSearchedLatitude;
    final centerLng = state.lastSearchedLongitude;

    if (centerLat == null || centerLng == null) {
      return const {};
    }

    return {
      Circle(
        circleId: const CircleId('prakaro_search_radius_circle'),
        center: LatLng(centerLat, centerLng),
        radius: state.radiusMeters.toDouble(),
        fillColor: colorScheme.primary.withValues(alpha: 0.10),
        strokeColor: colorScheme.primary.withValues(alpha: 0.38),
        strokeWidth: 2,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Center map once user location becomes available or when search center changes
    ref.listen<ParkingMapState>(parkingMapProvider, (previous, next) {
      if (!_hasCenteredOnUser &&
          next.userLatitude != null &&
          next.userLongitude != null &&
          _mapController != null) {
        _animateToPosition(next.userLatitude!, next.userLongitude!);
        _hasCenteredOnUser = true;
      }

      // Animate map when destination search center changes
      if (previous?.searchCenterLatitude != next.searchCenterLatitude ||
          previous?.searchCenterLongitude != next.searchCenterLongitude) {
        if (next.searchCenterLatitude != null && next.searchCenterLongitude != null) {
          _animateToPosition(next.searchCenterLatitude!, next.searchCenterLongitude!);
        }
      }
    });

    final initialTarget = (state.userLatitude != null && state.userLongitude != null)
        ? LatLng(state.userLatitude!, state.userLongitude!)
        : _fallbackLocation;

    final displayedMarkers = _buildMarkers(state.filteredLocations, state.selectedLocation);
    final displayedCircles = _buildCircles(state, colorScheme);

    return Scaffold(
      body: Stack(
        children: [
          // 1. Full-screen Google Map with Radius Circle and Parking Markers
          GoogleMap(
            onMapCreated: _onMapCreated,
            initialCameraPosition: CameraPosition(
              target: initialTarget,
              zoom: _defaultZoom,
            ),
            myLocationEnabled: state.userLatitude != null,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            compassEnabled: true,
            mapToolbarEnabled: false,
            markers: displayedMarkers,
            circles: displayedCircles,
            onCameraMove: (position) {
              _currentCameraPosition = position;
            },
            onCameraIdle: () {
              if (_currentCameraPosition != null) {
                notifier.onCameraIdle(
                  _currentCameraPosition!.target.latitude,
                  _currentCameraPosition!.target.longitude,
                );
              }
            },
            onTap: (_) {
              if (state.selectedLocation != null) {
                notifier.selectLocation(null);
              }
            },
          ),

          // 2. Top Bar with Branding, Switcher, Radius Selector, and Filter Bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Row 1: Brand badge, Account button & View switcher
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Compact Branding Badge
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: colorScheme.surface.withValues(alpha: 0.95),
                              borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.08),
                                  blurRadius: 6,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 22,
                                  height: 22,
                                  decoration: BoxDecoration(
                                    color: colorScheme.primaryContainer,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    'P',
                                    style: TextStyle(
                                      color: colorScheme.onPrimaryContainer,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Prakaro',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.3,
                                    color: colorScheme.onSurface,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 6),
                          // Profile / Account Button
                          GestureDetector(
                            onTap: () {
                              AppHaptics.selection();
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(builder: (_) => const ProfileScreen()),
                              );
                            },
                            child: Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: colorScheme.surface.withValues(alpha: 0.95),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.08),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Icon(
                                Icons.person_outline_rounded,
                                size: 18,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ],
                      ),

                      // View Switcher (List / Map)
                      ParkingViewSwitcher(
                        currentMode: state.viewMode,
                        onModeChanged: (mode) => notifier.setViewMode(mode),
                      ),
                    ],
                  ),

                  // Floating Destination Search Bar
                  GestureDetector(
                    onTap: () {
                      AppHaptics.selection();
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const DestinationSearchScreen(),
                        ),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      margin: const EdgeInsets.only(top: 8),
                      decoration: BoxDecoration(
                        color: colorScheme.surface.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                        border: Border.all(
                          color: state.destinationName != null
                              ? colorScheme.primary.withValues(alpha: 0.6)
                              : colorScheme.outlineVariant.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            state.destinationName != null
                                ? Icons.place_rounded
                                : Icons.search_rounded,
                            size: 18,
                            color: state.destinationName != null
                                ? colorScheme.primary
                                : colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              state.destinationName != null
                                  ? state.destinationName!
                                  : 'Search destination...',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: state.destinationName != null
                                    ? colorScheme.onSurface
                                    : colorScheme.onSurfaceVariant,
                                fontWeight: state.destinationName != null
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (state.destinationName != null)
                            GestureDetector(
                              onTap: () {
                                AppHaptics.selection();
                                notifier.clearDestination();
                              },
                              child: Container(
                                padding: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  color: colorScheme.surfaceContainerHighest,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 14,
                                  color: colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 8),

                  // Row 2: Search Radius Segmented Selector
                  Container(
                    decoration: BoxDecoration(
                      color: colorScheme.surface.withValues(alpha: 0.95),
                      borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(2),
                    child: const ParkingRadiusSelector(isCompact: true),
                  ),

                  // Row 3: Shared Quick Filters Bar
                  if (state.locations.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const ParkingFilterBar(),
                  ],

                  // "Search this area" Button
                  if (state.canSearchArea && !state.isLoading) ...[
                    const SizedBox(height: 10),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.refresh_rounded, size: 16),
                      label: const Text('Search this area'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colorScheme.surface,
                        foregroundColor: colorScheme.primary,
                        elevation: 3,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        ),
                      ),
                      onPressed: () {
                        AppHaptics.lightImpact();
                        notifier.searchCurrentArea();
                      },
                    ),
                  ],

                  // Loading Indicator
                  if (state.isLoading) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: colorScheme.surface.withValues(alpha: 0.94),
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: colorScheme.primary,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Finding parking within ${state.searchRadiusKm} km...',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurface,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  // Filter Empty Notice Floating Chip
                  if (state.isFilterEmpty && !state.isLoading) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: colorScheme.surface.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.filter_alt_off_rounded, size: 16, color: colorScheme.error),
                          const SizedBox(width: 8),
                          Text(
                            '0 matching facilities on map',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurface,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => notifier.clearFilters(),
                            child: Text(
                              'Clear',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colorScheme.primary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  // Stale Results Notice Chip (when refresh fails on same query)
                  if (state.isStaleResults && state.staleNotice != null && !state.isLoading) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: colorScheme.surface.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.info_outline_rounded, size: 14, color: colorScheme.primary),
                          const SizedBox(width: 6),
                          Text(
                            state.staleNotice!,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: colorScheme.onSurface,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // 3. Recenter Floating Button (animated above the details sheet if open)
          AnimatedPositioned(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            right: 16,
            bottom: state.selectedLocation != null ? 240 : 28,
            child: FloatingActionButton.small(
              heroTag: 'recenter_fab',
              backgroundColor: colorScheme.surface,
              foregroundColor: colorScheme.primary,
              elevation: 3,
              tooltip: state.isCustomSearchArea ? 'Reset to my location' : 'Re-center on my location',
              child: Icon(
                state.isCustomSearchArea ? Icons.near_me_rounded : Icons.my_location_rounded,
                size: 20,
              ),
              onPressed: () {
                AppHaptics.lightImpact();
                final userLat = state.userLatitude;
                final userLng = state.userLongitude;
                if (userLat != null && userLng != null) {
                  _animateToPosition(userLat, userLng);
                  notifier.searchNearUser();
                } else {
                  notifier.init(force: true);
                }
              },
            ),
          ),

          // 4. Overlays for Permission / Unavailable States
          if (state.status == ParkingMapStatus.locationPermissionRequired)
            _buildPermissionBanner(context, notifier, colorScheme, theme),

          if (state.status == ParkingMapStatus.locationUnavailable)
            _buildLocationUnavailableBanner(context, notifier, colorScheme, theme),

          if (state.status == ParkingMapStatus.empty && !state.isLoading && state.locations.isEmpty)
            _buildEmptyStateToast(context, state, notifier, colorScheme, theme),

          if (state.status == ParkingMapStatus.backendUnavailable && !state.isLoading)
            _buildBackendErrorBanner(context, state, colorScheme, theme),

          // 5. Selected Parking Details Sheet
          if (state.selectedLocation != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: ParkingDetailsSheet(
                location: state.selectedLocation!,
                distanceMeters: notifier.getDistanceTo(state.selectedLocation!),
                onClose: () => notifier.selectLocation(null),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPermissionBanner(
    BuildContext context,
    ParkingMapNotifier notifier,
    ColorScheme colorScheme,
    ThemeData theme,
  ) {
    return Positioned(
      bottom: 24,
      left: 16,
      right: 16,
      child: Card(
        color: colorScheme.surface,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_on_outlined, size: 32, color: colorScheme.primary),
              const SizedBox(height: 8),
              Text(
                'Find parking near you',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Allow location access to show parking facilities and your current position on the map.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                icon: const Icon(Icons.near_me_rounded, size: 16),
                label: const Text('Allow Location'),
                onPressed: () => notifier.init(force: true),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLocationUnavailableBanner(
    BuildContext context,
    ParkingMapNotifier notifier,
    ColorScheme colorScheme,
    ThemeData theme,
  ) {
    return Positioned(
      bottom: 24,
      left: 16,
      right: 16,
      child: Card(
        color: colorScheme.surface,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_off_outlined, size: 32, color: colorScheme.error),
              const SizedBox(height: 8),
              Text(
                'Location is turned off',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Turn on location services to find parking near you.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                icon: const Icon(Icons.location_searching_rounded, size: 16),
                label: const Text('Enable Location'),
                onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyStateToast(
    BuildContext context,
    ParkingMapState state,
    ParkingMapNotifier notifier,
    ColorScheme colorScheme,
    ThemeData theme,
  ) {
    return Positioned(
      bottom: 32,
      left: 24,
      right: 24,
      child: Card(
        color: colorScheme.surface.withValues(alpha: 0.95),
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusMedium)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
          child: Row(
            children: [
              Icon(Icons.info_outline_rounded, size: 20, color: colorScheme.onSurfaceVariant),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'No parking found within ${state.searchRadiusKm} km.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (state.canIncreaseRadius)
                TextButton(
                  onPressed: () => notifier.increaseRadius(),
                  child: Text('Expand (${state.nextRadiusMeters ~/ 1000} km)'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBackendErrorBanner(
    BuildContext context,
    ParkingMapState state,
    ColorScheme colorScheme,
    ThemeData theme,
  ) {
    String message = state.errorMessage ?? 'Unable to connect to parking service.';
    IconData icon = Icons.cloud_off_rounded;

    if (state.isOffline) {
      message = "You're offline. Connect to the internet to search for parking.";
      icon = Icons.wifi_off_rounded;
    } else if (state.isTimedOut) {
      message = 'This search is taking longer than expected.';
      icon = Icons.timer_outlined;
    } else if (state.isRateLimited) {
      message = 'Too many searches. Please wait a moment.';
      icon = Icons.speed_rounded;
    }

    return Positioned(
      bottom: 24,
      left: 16,
      right: 16,
      child: Card(
        color: colorScheme.surface,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radiusCard)),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              Icon(icon, size: 24, color: colorScheme.error),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  message,
                  style: theme.textTheme.bodySmall?.copyWith(color: colorScheme.onSurface),
                ),
              ),
              TextButton(
                onPressed: () => ref.read(parkingMapProvider.notifier).refresh(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
