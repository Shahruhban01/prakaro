import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/parking_location.dart';
import 'parking_providers.dart';
import 'widgets/google_attribution.dart';
import 'widgets/parking_card.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_empty_state.dart';
import 'widgets/parking_filter_bar.dart';
import 'widgets/parking_loading_state.dart';
import 'widgets/parking_view_switcher.dart';

/// The default home screen view presenting nearby parking facilities in a scannable list.
class ParkingListScreen extends ConsumerWidget {
  const ParkingListScreen({super.key});

  void _showDetailsSheet(BuildContext context, ParkingLocation location, double? distance) {
    AppHaptics.lightImpact();
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

    final filteredItems = state.filteredLocationsWithDistance;
    final totalDiscovered = state.locations.length;
    final radiusKm = (state.radiusMeters / 1000).toStringAsFixed(0);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
              ),
              alignment: Alignment.center,
              child: Text(
                'P',
                style: TextStyle(
                  color: colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Prakaro',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh nearby parking',
            icon: const Icon(Icons.my_location_rounded, size: 20),
            onPressed: () => notifier.refresh(),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.refresh(),
        color: colorScheme.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // 1. Compact Header, View Switcher & Smart Filters Section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Context headline and view switcher
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Parking near you',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.4,
                                  color: colorScheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                state.userLatitude != null
                                    ? 'Within $radiusKm km • Straight-line distance'
                                    : 'Searching around your location',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                  letterSpacing: -0.1,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // List / Map Segment Switcher
                        ParkingViewSwitcher(
                          currentMode: state.viewMode,
                          onModeChanged: (mode) => notifier.setViewMode(mode),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // 2. Horizontally Scrollable Filter Chips Bar
            if (state.status == ParkingMapStatus.loaded || state.locations.isNotEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.only(bottom: 8.0),
                  child: ParkingFilterBar(),
                ),
              ),

            // 3. Results Count Subheader (When loaded)
            if (state.status == ParkingMapStatus.loaded && totalDiscovered > 0)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        state.isAnyFilterActive
                            ? '${filteredItems.length} matching facilities ($totalDiscovered discovered)'
                            : '$totalDiscovered parking facilities found',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: colorScheme.onSurface,
                          letterSpacing: -0.2,
                        ),
                      ),
                      Text(
                        'Nearest first',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // 4. Body State Routing
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
            else if (state.status == ParkingMapStatus.backendUnavailable && state.locations.isEmpty)
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
            else if (state.status == ParkingMapStatus.error && state.locations.isEmpty)
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
            else if (state.isLoading && state.locations.isEmpty)
              const SliverToBoxAdapter(
                child: ParkingLoadingState(),
              )
            else if (state.isFilterEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _buildFilterEmptyState(state, notifier),
              )
            else if (state.status == ParkingMapStatus.empty || filteredItems.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: ParkingEmptyState(
                  title: 'No parking facilities found',
                  message:
                      'No parking facilities were found within your current search area. Try refreshing or searching from a different location.',
                  onRetry: () => notifier.refresh(),
                ),
              )
            else ...[
              // 5. Scrollable List of Parking Cards
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final item = filteredItems[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10.0),
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
                    childCount: filteredItems.length,
                  ),
                ),
              ),

              // 6. Subtle Google Attribution Footer
              const SliverToBoxAdapter(
                child: GoogleAttributionFooter(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFilterEmptyState(ParkingMapState state, ParkingMapNotifier notifier) {
    if (state.pricingFilter == PricingFilter.free) {
      return ParkingEmptyState(
        title: 'No confirmed free parking found',
        message:
            'None of the ${state.locations.length} facilities in this area have verified free parking in Google Places data.',
        onClearFilters: () => notifier.clearFilters(),
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.pricingFilter == PricingFilter.paid) {
      return ParkingEmptyState(
        title: 'No confirmed paid parking found',
        message:
            'None of the ${state.locations.length} facilities in this area have verified paid parking in Google Places data.',
        onClearFilters: () => notifier.clearFilters(),
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.openNowFilter) {
      return ParkingEmptyState(
        title: 'No verified open parking found right now',
        message:
            'Operating hours are either unlisted or facilities are currently closed for the ${state.locations.length} nearby locations.',
        onClearFilters: () => notifier.clearFilters(),
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.publicAccessFilter) {
      return ParkingEmptyState(
        title: 'No confirmed public parking found',
        message:
            'Public access classifications are not currently provided by Google Places for these facilities.',
        onClearFilters: () => notifier.clearFilters(),
        onRetry: () => notifier.refresh(),
      );
    }

    return ParkingEmptyState(
      title: 'No matching parking facilities',
      message: 'No facilities match your active filters. Try clearing your filters.',
      onClearFilters: () => notifier.clearFilters(),
      onRetry: () => notifier.refresh(),
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
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.location_on_outlined, size: 26, color: colorScheme.primary),
                ),
                const SizedBox(height: 16),
                Text(
                  'Find parking near you',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Allow location access to discover nearby parking facilities around your current position.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.near_me_rounded, size: 18),
                  label: const Text('Allow Location Access'),
                  onPressed: () => notifier.init(force: true),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => ref.read(locationServiceProvider).openAppSettings(),
                  child: const Text('Open Device Settings'),
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
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: colorScheme.errorContainer.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.location_off_outlined, size: 26, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  'Location is turned off',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Turn on location services so Prakaro can display parking facilities near you.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.location_searching_rounded, size: 18),
                  label: const Text('Enable Location'),
                  onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => notifier.init(force: true),
                  child: const Text('I turned it on - Try Again'),
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
    String? message,
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
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: colorScheme.errorContainer.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.cloud_off_rounded, size: 26, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  'Parking service unavailable',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  message ?? 'Unable to connect to the parking discovery service. Please try again.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Retry Connection'),
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
    String? message,
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
                Icon(Icons.error_outline_rounded, size: 36, color: colorScheme.error),
                const SizedBox(height: 14),
                Text(
                  'Something went wrong',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  message ?? 'An unexpected error occurred while loading parking locations.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.tonalIcon(
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
}
