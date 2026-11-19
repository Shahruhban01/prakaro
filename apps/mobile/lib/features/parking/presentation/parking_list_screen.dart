import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/screens/profile_screen.dart';
import '../domain/parking_location.dart';
import 'destination_search_screen.dart';
import 'parking_providers.dart';
import 'widgets/google_attribution.dart';
import 'widgets/parking_card.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_empty_state.dart';
import 'widgets/parking_filter_bar.dart';
import 'widgets/parking_loading_state.dart';
import 'widgets/parking_radius_selector.dart';
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
            tooltip: 'Search destination',
            icon: const Icon(Icons.search_rounded, size: 22),
            onPressed: () {
              AppHaptics.selection();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const DestinationSearchScreen()),
              );
            },
          ),
          IconButton(
            tooltip: 'Refresh nearby parking',
            icon: const Icon(Icons.my_location_rounded, size: 20),
            onPressed: () => notifier.refresh(),
          ),
          IconButton(
            tooltip: 'Account',
            icon: const Icon(Icons.account_circle_outlined, size: 22),
            onPressed: () {
              AppHaptics.selection();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ProfileScreen()),
              );
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.refresh(),
        color: colorScheme.primary,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // 1. Destination Search Bar, View Switcher & Search Radius Section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Destination Search Bar Tap Target
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
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                          border: Border.all(
                            color: state.destinationName != null
                                ? colorScheme.primary.withValues(alpha: 0.5)
                                : colorScheme.outlineVariant.withValues(alpha: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              state.destinationName != null
                                  ? Icons.place_rounded
                                  : Icons.search_rounded,
                              size: 20,
                              color: state.destinationName != null
                                  ? colorScheme.primary
                                  : colorScheme.onSurfaceVariant,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                state.destinationName != null
                                    ? state.destinationName!
                                    : 'Search a destination or address...',
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
                                    size: 16,
                                    color: colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),

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
                                state.searchContextTitle,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.4,
                                  color: colorScheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${state.searchContextLabel} • ${state.distanceReferenceNote}',
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

                    const SizedBox(height: 8),

                    // Radius Selector + Reset Map Area Row
                    Row(
                      children: [
                        const Expanded(
                          child: ParkingRadiusSelector(isCompact: true),
                        ),
                        if (state.isCustomSearchArea) ...[
                          const SizedBox(width: 8),
                          FilledButton.tonalIcon(
                            icon: const Icon(Icons.near_me_rounded, size: 16),
                            label: const Text('Near me'),
                            style: FilledButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                              ),
                            ),
                            onPressed: () => notifier.searchNearUser(),
                          ),
                        ],
                      ],
                    ),

                    // In-flight loading progress bar when facilities are already visible
                    if (state.isLoading && state.locations.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          minHeight: 2,
                          backgroundColor: colorScheme.surfaceContainerHighest,
                          color: colorScheme.primary,
                        ),
                      ),
                    ],
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

            // 3. Stale Results Notice Banner (when refresh fails on same query)
            if (state.isStaleResults && state.staleNotice != null)
              SliverToBoxAdapter(
                child: _buildStaleNoticeBanner(context, state, notifier),
              ),

            // 4. Results Count Subheader (When loaded)
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

            // 5. Body State Routing
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
                  state,
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
                  state,
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
                  message: state.canIncreaseRadius
                      ? 'No parking facilities were found within ${state.searchRadiusKm} km. Try increasing your search radius to discover parking further out.'
                      : 'No parking facilities were found within maximum range (5 km). Try searching a different location or refreshing.',
                  onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
                  increaseRadiusLabel: 'Increase to ${state.nextRadiusMeters ~/ 1000} km',
                  onResetSearchArea: state.isCustomSearchArea ? () => notifier.searchNearUser() : null,
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
            'None of the ${state.locations.length} facilities within ${state.searchRadiusKm} km have verified free parking in Google Places data.',
        onClearFilters: () => notifier.clearFilters(),
        onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
        increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.pricingFilter == PricingFilter.paid) {
      return ParkingEmptyState(
        title: 'No confirmed paid parking found',
        message:
            'None of the ${state.locations.length} facilities within ${state.searchRadiusKm} km have verified paid parking in Google Places data.',
        onClearFilters: () => notifier.clearFilters(),
        onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
        increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.openNowFilter) {
      return ParkingEmptyState(
        title: 'No verified open parking found right now',
        message:
            'Operating hours are either unlisted or facilities are currently closed for the ${state.locations.length} nearby locations.',
        onClearFilters: () => notifier.clearFilters(),
        onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
        increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
        onRetry: () => notifier.refresh(),
      );
    }
    if (state.publicAccessFilter) {
      return ParkingEmptyState(
        title: 'No confirmed public parking found',
        message:
            'Public access classifications are not currently provided by Google Places for these facilities.',
        onClearFilters: () => notifier.clearFilters(),
        onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
        increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
        onRetry: () => notifier.refresh(),
      );
    }

    return ParkingEmptyState(
      title: 'No matching parking facilities',
      message: 'No facilities match your active filters. Try clearing your filters or widening your radius.',
      onClearFilters: () => notifier.clearFilters(),
      onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
      increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
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
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    ),
                  ),
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
                  'Turn on location services in device settings to detect nearby parking facilities.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.settings_outlined, size: 18),
                  label: const Text('Open Location Settings'),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    ),
                  ),
                  onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStaleNoticeBanner(
    BuildContext context,
    ParkingMapState state,
    ParkingMapNotifier notifier,
  ) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 16,
            color: colorScheme.primary,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              state.staleNotice ?? 'Showing previous results. Refresh to try again.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurface,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => notifier.refresh(),
            borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: Text(
                'Refresh',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackendErrorView(
    BuildContext context,
    ParkingMapNotifier notifier,
    ParkingMapState state,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    String title = 'Parking service unavailable';
    String message = state.errorMessage ??
        'Parking discovery is temporarily unavailable. Please verify backend connection and try again.';
    IconData icon = Icons.cloud_off_rounded;
    String buttonLabel = 'Retry Connection';

    if (state.isOffline) {
      title = "You're offline";
      message = "You're offline. Connect to the internet to search for parking.";
      icon = Icons.wifi_off_rounded;
      buttonLabel = 'Retry';
    } else if (state.isTimedOut) {
      title = 'Search timed out';
      message = 'This search is taking longer than expected.';
      icon = Icons.timer_outlined;
      buttonLabel = 'Try Again';
    } else if (state.isRateLimited) {
      title = 'Too many searches';
      message = 'Too many searches. Please wait a moment.';
      icon = Icons.speed_rounded;
      buttonLabel = 'Wait & Retry';
    }

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
                  child: Icon(icon, size: 26, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: Text(buttonLabel),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    ),
                  ),
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
    ParkingMapState state,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    String title = 'Something went wrong';
    String message =
        state.errorMessage ?? 'An error occurred while finding parking. Please try again.';
    IconData icon = Icons.error_outline_rounded;
    String buttonLabel = 'Try Again';

    if (state.isOffline) {
      title = "You're offline";
      message = "You're offline. Connect to the internet to search for parking.";
      icon = Icons.wifi_off_rounded;
    } else if (state.isTimedOut) {
      title = 'Search timed out';
      message = 'This search is taking longer than expected.';
      icon = Icons.timer_outlined;
    } else if (state.isRateLimited) {
      title = 'Too many searches';
      message = 'Too many searches. Please wait a moment.';
      icon = Icons.speed_rounded;
      buttonLabel = 'Wait & Retry';
    }

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
                  child: Icon(icon, size: 26, color: colorScheme.error),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: Text(buttonLabel),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    ),
                  ),
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
