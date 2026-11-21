import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../core/design/components/prakaro_button.dart';
import '../../../core/design/components/prakaro_card.dart';
import '../../../core/design/components/prakaro_search_bar.dart';
import '../../../core/design/prakaro_icons.dart';
import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/screens/profile_screen.dart';
import '../domain/parking_location.dart';
import 'destination_search_screen.dart';
import 'parking_providers.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_discovery_control.dart';
import '../domain/parking_verification.dart';
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

  Set<Marker> _buildMarkers(List<ParkingLocation> locations, ParkingLocation? selected, bool verificationAvailable) {
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
          snippet: loc.verification == null ? loc.address
              : !verificationAvailable ? 'Information unavailable'
              : loc.verification!.isRestricted ? '${loc.verification!.label} · Restricted access'
              : loc.verification!.label,
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

    final displayedMarkers = _buildMarkers(state.filteredLocations, state.selectedLocation, state.verificationAvailable);
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
                              color: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                              borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                              border: Border.all(
                                color: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                                width: 1.0,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.3 : 0.08),
                                  blurRadius: 10,
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
                                    color: AppTheme.primaryBlue,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  alignment: Alignment.center,
                                  child: const Text(
                                    'P',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Prakaro',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.3,
                                    fontSize: 14,
                                    color: theme.brightness == Brightness.dark
                                        ? AppTheme.textPrimaryDark
                                        : AppTheme.textPrimaryLight,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          // Profile / Account Button
                          Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.3 : 0.08),
                                  blurRadius: 10,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: PrakaroIconButton(
                              icon: PrakaroIconData.user,
                              tooltip: 'Account',
                              size: 36,
                              iconSize: 18,
                              backgroundColor: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                              borderColor: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(builder: (_) => const ProfileScreen()),
                                );
                              },
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

                  const SizedBox(height: 10),

                  // Floating Destination Search Bar
                  PrakaroSearchBarTrigger(
                    destinationName: state.destinationName,
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const DestinationSearchScreen(),
                        ),
                      );
                    },
                    onClear: state.destinationName != null
                        ? () => notifier.clearDestination()
                        : null,
                    placeholder: 'Search destination...',
                  ),

                  const SizedBox(height: 8),

                  // Row 2: Search Radius Segmented Selector
                  const ParkingRadiusSelector(isCompact: true),
                  const ParkingDiscoveryControl(),

                  // Row 3: Shared Quick Filters Bar
                  if (state.locations.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    const ParkingFilterBar(),
                  ],

                  // "Search this area" Button
                  if (state.canSearchArea && !state.isLoading) ...[
                    const SizedBox(height: 10),
                    PrakaroButton.primary(
                      label: 'Search this area',
                      icon: PrakaroIconData.refresh,
                      size: PrakaroButtonSize.small,
                      onPressed: () {
                        notifier.searchCurrentArea();
                      },
                    ),
                  ],

                  // Loading Indicator
                  if (state.isLoading) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        border: Border.all(
                          color: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                          width: 1.0,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.3 : 0.08),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const PrakaroIcon(
                            PrakaroIconData.search,
                            size: 14,
                            color: AppTheme.primaryBlue,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Finding parking within ${state.searchRadiusKm} km...',
                            style: TextStyle(
                              fontSize: 12.0,
                              fontWeight: FontWeight.w600,
                              color: theme.brightness == Brightness.dark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
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
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        border: Border.all(
                          color: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                          width: 1.0,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.3 : 0.08),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const PrakaroIcon(
                            PrakaroIconData.filter,
                            size: 14,
                            color: AppTheme.textSecondaryLight,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '0 matching facilities on map',
                            style: TextStyle(
                              fontSize: 12.0,
                              fontWeight: FontWeight.w600,
                              color: theme.brightness == Brightness.dark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => notifier.clearFilters(),
                            child: const Text(
                              'Clear',
                              style: TextStyle(
                                fontSize: 12.0,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.primaryBlue,
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
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        border: Border.all(
                          color: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                          width: 1.0,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.3 : 0.08),
                            blurRadius: 10,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const PrakaroIcon(
                            PrakaroIconData.info,
                            size: 14,
                            color: AppTheme.primaryBlue,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            state.staleNotice!,
                            style: TextStyle(
                              fontSize: 12.0,
                              fontWeight: FontWeight.w600,
                              color: theme.brightness == Brightness.dark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
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
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: theme.brightness == Brightness.dark ? 0.4 : 0.12),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: PrakaroIconButton(
                size: 46.0,
                iconSize: 22.0,
                icon: state.isCustomSearchArea ? PrakaroIconData.nearMe : PrakaroIconData.nearMe,
                color: AppTheme.primaryBlue,
                backgroundColor: theme.brightness == Brightness.dark ? AppTheme.surfaceCardDark : Colors.white,
                borderColor: theme.brightness == Brightness.dark ? AppTheme.borderDark : AppTheme.borderLight,
                tooltip: state.isCustomSearchArea ? 'Reset to my location' : 'Re-center on my location',
                onPressed: () {
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
          ),

          // 4. Overlays for Permission / Unavailable States
          if (state.status == ParkingMapStatus.locationPermissionRequired)
            _buildPermissionBanner(context, notifier, colorScheme, theme),

          if (state.status == ParkingMapStatus.locationUnavailable)
            _buildLocationUnavailableBanner(context, notifier, colorScheme, theme),

          if (state.isVerifiedEmpty ||
              (state.status == ParkingMapStatus.empty && !state.isLoading && state.locations.isEmpty))
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
                verificationUnavailable: !state.verificationAvailable,
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
      child: PrakaroCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: AppTheme.accentSoftLight,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const PrakaroIcon(
                PrakaroIconData.locationPin,
                size: 22,
                color: AppTheme.primaryBlue,
              ),
            ),
            const SizedBox(height: 10),
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
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.brightness == Brightness.dark
                    ? AppTheme.textSecondaryDark
                    : AppTheme.textSecondaryLight,
              ),
            ),
            const SizedBox(height: 16),
            PrakaroButton.primary(
              label: 'Allow Location',
              icon: PrakaroIconData.nearMe,
              isFullWidth: true,
              onPressed: () => notifier.init(force: true),
            ),
          ],
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
      child: PrakaroCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: Color(0xFFFDE8E8),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const PrakaroIcon(
                PrakaroIconData.locationPin,
                size: 22,
                color: Color(0xFFDC2626),
              ),
            ),
            const SizedBox(height: 10),
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
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.brightness == Brightness.dark
                    ? AppTheme.textSecondaryDark
                    : AppTheme.textSecondaryLight,
              ),
            ),
            const SizedBox(height: 16),
            PrakaroButton.primary(
              label: 'Enable Location',
              icon: PrakaroIconData.nearMe,
              isFullWidth: true,
              onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
            ),
          ],
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
      left: 20,
      right: 20,
      child: PrakaroCard(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
        child: Row(
          children: [
            const PrakaroIcon(
              PrakaroIconData.info,
              size: 20,
              color: AppTheme.primaryBlue,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                state.isVerifiedEmpty ? 'No verified parking found'
                    : 'No parking found within ${state.searchRadiusKm} km.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.1,
                ),
              ),
            ),
            if (state.isVerifiedEmpty)
              PrakaroButton.tonal(
                label: 'All Candidates',
                size: PrakaroButtonSize.small,
                onPressed: () => notifier.setDiscoveryMode(ParkingDiscoveryMode.allCandidates),
              )
            else if (state.canIncreaseRadius)
              PrakaroButton.tonal(
                label: 'Expand (${state.nextRadiusMeters ~/ 1000} km)',
                size: PrakaroButtonSize.small,
                onPressed: () => notifier.increaseRadius(),
              ),
          ],
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

    if (state.isOffline) {
      message = "You're offline. Connect to the internet to search for parking.";
    } else if (state.isTimedOut) {
      message = 'This search is taking longer than expected.';
    } else if (state.isRateLimited) {
      message = 'Too many searches. Please wait a moment.';
    }

    return Positioned(
      bottom: 24,
      left: 16,
      right: 16,
      child: PrakaroCard(
        child: Row(
          children: [
            const PrakaroIcon(
              PrakaroIconData.info,
              size: 22,
              color: Color(0xFFDC2626),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface),
              ),
            ),
            const SizedBox(width: 8),
            PrakaroButton.tonal(
              label: 'Retry',
              size: PrakaroButtonSize.small,
              onPressed: () => ref.read(parkingMapProvider.notifier).refresh(),
            ),
          ],
        ),
      ),
    );
  }
}
