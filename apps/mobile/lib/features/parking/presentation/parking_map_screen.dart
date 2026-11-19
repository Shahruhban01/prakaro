import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../core/services/location_service.dart';
import '../domain/parking_location.dart';
import 'parking_providers.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_view_switcher.dart';

/// Interactive Google Maps screen presenting parking facilities with markers and gestures.
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

      return Marker(
        markerId: MarkerId(loc.id),
        position: LatLng(loc.latitude, loc.longitude),
        icon: BitmapDescriptor.defaultMarkerWithHue(
          isSelected ? BitmapDescriptor.hueViolet : BitmapDescriptor.hueAzure,
        ),
        infoWindow: InfoWindow(
          title: loc.name,
          snippet: loc.address,
        ),
        onTap: () {
          ref.read(parkingMapProvider.notifier).selectLocation(loc);
        },
      );
    }).toSet();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Center map once user location becomes available
    ref.listen<ParkingMapState>(parkingMapProvider, (previous, next) {
      if (!_hasCenteredOnUser &&
          next.userLatitude != null &&
          next.userLongitude != null &&
          _mapController != null) {
        _animateToPosition(next.userLatitude!, next.userLongitude!);
        _hasCenteredOnUser = true;
      }
    });

    final initialTarget = (state.userLatitude != null && state.userLongitude != null)
        ? LatLng(state.userLatitude!, state.userLongitude!)
        : _fallbackLocation;

    return Scaffold(
      body: Stack(
        children: [
          // 1. Full-screen Google Map
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
            markers: _buildMarkers(state.locations, state.selectedLocation),
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

          // 2. Top Bar with Branding & View Switcher
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Branding Badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: colorScheme.surface.withValues(alpha: 0.95),
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.local_parking_rounded,
                              size: 20,
                              color: colorScheme.primary,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Prakaro',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: colorScheme.onSurface,
                              ),
                            ),
                          ],
                        ),
                      ),

                      // View Switcher (List / Map)
                      ParkingViewSwitcher(
                        currentMode: state.viewMode,
                        onModeChanged: (mode) => notifier.setViewMode(mode),
                      ),
                    ],
                  ),

                  // Spots count badge
                  if (state.status == ParkingMapStatus.loaded && state.locations.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: colorScheme.primaryContainer.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Text(
                        '${state.locations.length} spots nearby',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: colorScheme.onPrimaryContainer,
                        ),
                      ),
                    ),
                  ],

                  // "Search this area" Button
                  if (state.canSearchArea && !state.isLoading) ...[
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.refresh_rounded, size: 18),
                      label: const Text('Search this area'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colorScheme.surface,
                        foregroundColor: colorScheme.primary,
                        elevation: 4,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                      ),
                      onPressed: () => notifier.searchCurrentArea(),
                    ),
                  ],

                  // Loading Indicator
                  if (state.isLoading) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: colorScheme.surface.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(20),
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
                          const SizedBox(width: 10),
                          Text(
                            'Finding parking spots...',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurface,
                              fontWeight: FontWeight.w500,
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

          // 3. Recenter Floating Button
          Positioned(
            right: 16,
            bottom: state.selectedLocation != null ? 220 : 32,
            child: FloatingActionButton.small(
              heroTag: 'recenter_fab',
              backgroundColor: colorScheme.surface,
              foregroundColor: colorScheme.primary,
              elevation: 4,
              tooltip: 'Re-center on my location',
              child: const Icon(Icons.my_location_rounded),
              onPressed: () {
                final userLat = state.userLatitude;
                final userLng = state.userLongitude;
                if (userLat != null && userLng != null) {
                  _animateToPosition(userLat, userLng);
                  notifier.searchNearby(latitude: userLat, longitude: userLng);
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

          if (state.status == ParkingMapStatus.empty && !state.isLoading)
            _buildEmptyStateToast(context, colorScheme, theme),

          if (state.status == ParkingMapStatus.backendUnavailable && !state.isLoading)
            _buildBackendErrorBanner(context, state.errorMessage, colorScheme, theme),

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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_off_rounded, size: 36, color: colorScheme.error),
              const SizedBox(height: 8),
              Text(
                'Location Permission Required',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                'Prakaro needs foreground location access to find nearby parking facilities around you.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton(
                    onPressed: () => ref.read(locationServiceProvider).openAppSettings(),
                    child: const Text('Open Settings'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: () => notifier.init(force: true),
                    child: const Text('Grant Access'),
                  ),
                ],
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.gps_off_rounded, size: 36, color: colorScheme.error),
              const SizedBox(height: 8),
              Text(
                'Device Location Disabled',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                'Please enable GPS / location services on your device to discover parking spots.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
                child: const Text('Enable Location'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyStateToast(BuildContext context, ColorScheme colorScheme, ThemeData theme) {
    return Positioned(
      bottom: 24,
      left: 32,
      right: 32,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: colorScheme.inverseSurface.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.info_outline_rounded, size: 18, color: colorScheme.onInverseSurface),
            const SizedBox(width: 8),
            Text(
              'No parking facilities found in this area.',
              style: theme.textTheme.bodyMedium?.copyWith(color: colorScheme.onInverseSurface),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBackendErrorBanner(
    BuildContext context,
    String? message,
    ColorScheme colorScheme,
    ThemeData theme,
  ) {
    return Positioned(
      bottom: 24,
      left: 20,
      right: 20,
      child: Card(
        color: colorScheme.errorContainer,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.cloud_off_rounded, color: colorScheme.onErrorContainer),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Service Notice',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: colorScheme.onErrorContainer,
                      ),
                    ),
                    Text(
                      message ?? 'Unable to connect to parking discovery service.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colorScheme.onErrorContainer,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
