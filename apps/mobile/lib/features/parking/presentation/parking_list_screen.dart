import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/location_service.dart';
import '../domain/parking_location.dart';
import 'parking_providers.dart';
import 'widgets/google_attribution.dart';
import 'widgets/parking_card.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_empty_state.dart';
import 'widgets/parking_loading_state.dart';
import 'widgets/parking_view_switcher.dart';

/// The default home screen view presenting nearby parking spots in a scrollable list.
class ParkingListScreen extends ConsumerWidget {
  const ParkingListScreen({super.key});

  void _showDetailsSheet(BuildContext context, ParkingLocation location, double? distance) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ParkingDetailsSheet(
        location: location,
        distanceMeters: distance,
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    final sortedItems = state.sortedLocationsWithDistance;
    final radiusKm = (state.radiusMeters / 1000).toStringAsFixed(0);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.local_parking_rounded,
                size: 20,
                color: colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Prakaro',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh Location',
            icon: const Icon(Icons.my_location_rounded),
            onPressed: () => notifier.refresh(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.refresh(),
        color: colorScheme.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // 1. Header & View Switcher Section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Parking near you',
                                style: theme.textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.5,
                                  color: colorScheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                state.userLatitude != null
                                    ? 'Within $radiusKm km of your current location'
                                    : 'Searching for parking around your device',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
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

                    const SizedBox(height: 16),

                    // Results Count Header (When loaded)
                    if (state.status == ParkingMapStatus.loaded && sortedItems.isNotEmpty)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${sortedItems.length} spots found',
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: colorScheme.onSurface,
                            ),
                          ),
                          Text(
                            'Sorted by distance',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),

            // 2. Body State Routing
            if (state.status == ParkingMapStatus.locationPermissionRequired)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _buildPermissionView(context, ref, notifier, theme, colorScheme),
              )
            else if (state.status == ParkingMapStatus.locationUnavailable)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _buildLocationDisabledView(context, ref, notifier, theme, colorScheme),
              )
            else if (state.status == ParkingMapStatus.backendUnavailable)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _buildBackendErrorView(
                  context,
                  notifier,
                  state.errorMessage,
                  theme,
                  colorScheme,
                ),
              )
            else if (state.status == ParkingMapStatus.error)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _buildGenericErrorView(
                  context,
                  notifier,
                  state.errorMessage,
                  theme,
                  colorScheme,
                ),
              )
            else if (state.isLoading)
              const SliverToBoxAdapter(
                child: ParkingLoadingState(),
              )
            else if (state.status == ParkingMapStatus.empty || sortedItems.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: ParkingEmptyState(
                  onRetry: () => notifier.refresh(),
                ),
              )
            else ...[
              // 3. Scrollable List of Parking Cards
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final item = sortedItems[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12.0),
                        child: ParkingCard(
                          location: item.location,
                          distanceMeters: item.distanceMeters,
                          onTap: () => _showDetailsSheet(
                            context,
                            item.location,
                            item.distanceMeters,
                          ),
                        ),
                      );
                    },
                    childCount: sortedItems.length,
                  ),
                ),
              ),

              // 4. Subtle Google Attribution Footer
              const SliverToBoxAdapter(
                child: GoogleAttributionFooter(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPermissionView(
    BuildContext context,
    WidgetRef ref,
    ParkingMapNotifier notifier,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: colorScheme.errorContainer.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.location_off_rounded, size: 28, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  'Location Permission Required',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Prakaro requires location permissions to discover parking facilities near your current position.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
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
      ),
    );
  }

  Widget _buildLocationDisabledView(
    BuildContext context,
    WidgetRef ref,
    ParkingMapNotifier notifier,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: colorScheme.errorContainer.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.gps_off_rounded, size: 28, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  'Location Services Disabled',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Please enable GPS / location services on your device to discover nearby parking spots.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.gps_fixed_rounded, size: 18),
                  label: const Text('Enable Location'),
                  onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBackendErrorView(
    BuildContext context,
    ParkingMapNotifier notifier,
    String? errorMessage,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Card(
          color: colorScheme.errorContainer.withValues(alpha: 0.35),
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off_rounded, size: 40, color: colorScheme.error),
                const SizedBox(height: 16),
                Text(
                  'Discovery Service Unavailable',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colorScheme.onSurface,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  errorMessage ??
                      'Unable to communicate with the parking discovery service. Please verify your connection.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Try Again'),
                  onPressed: () => notifier.refresh(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGenericErrorView(
    BuildContext context,
    ParkingMapNotifier notifier,
    String? errorMessage,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline_rounded, size: 40, color: colorScheme.error),
                const SizedBox(height: 16),
                Text(
                  'Something went wrong',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  errorMessage ?? 'An unexpected error occurred while searching for parking.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Retry'),
                  onPressed: () => notifier.refresh(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
