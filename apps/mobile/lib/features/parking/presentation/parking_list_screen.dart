import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/components/prakaro_button.dart';
import '../../../core/design/components/prakaro_card.dart';
import '../../../core/design/components/prakaro_header.dart';
import '../../../core/design/components/prakaro_search_bar.dart';
import '../../../core/design/prakaro_icons.dart';
import '../../../core/services/location_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/screens/profile_screen.dart';
import '../domain/parking_location.dart';
import '../domain/parking_verification.dart';
import 'destination_search_screen.dart';
import 'parking_providers.dart';
import 'widgets/google_attribution.dart';
import 'widgets/parking_card.dart';
import 'widgets/parking_details_sheet.dart';
import 'widgets/parking_discovery_control.dart';
import 'widgets/parking_empty_state.dart';
import 'widgets/parking_filter_bar.dart';
import 'widgets/parking_loading_state.dart';
import 'widgets/parking_radius_selector.dart';
import 'widgets/parking_view_switcher.dart';

/// The primary discovery view presenting nearby parking facilities in a scannable, human-centered list.
class ParkingListScreen extends ConsumerWidget {
  const ParkingListScreen({super.key});

  void _showDetailsSheet(BuildContext context, ParkingLocation location, double? distance, bool unavailable) {
    AppHaptics.lightImpact();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ParkingDetailsSheet(
        location: location,
        distanceMeters: distance,
        verificationUnavailable: unavailable,
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final filteredItems = state.filteredLocationsWithDistance;
    final totalDiscovered = state.locations.length;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.canvasDark : Colors.white,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // 1. Bespoke Prakaro Header (Branding & Global Controls)
            PrakaroHeader(
              title: 'Prakaro',
              showBrand: true,
              actions: [
                PrakaroIconButton(
                  icon: PrakaroIconData.search,
                  tooltip: 'Search destination',
                  onPressed: () {
                    AppHaptics.selection();
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const DestinationSearchScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(width: 4),
                PrakaroIconButton(
                  icon: PrakaroIconData.nearMe,
                  tooltip: 'Refresh nearby parking',
                  onPressed: () => notifier.refresh(),
                ),
                const SizedBox(width: 4),
                PrakaroIconButton(
                  icon: PrakaroIconData.user,
                  tooltip: 'Account',
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

            // 2. Scrollable Body
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => notifier.refresh(),
                color: AppTheme.primaryBlue,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    // A. Destination Search Bar, Context Headline & View Controls
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Destination Search Input Trigger
                            PrakaroSearchBarTrigger(
                              destinationName: state.destinationName,
                              placeholder: 'Where would you like to park?',
                              onClear: () => notifier.clearDestination(),
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => const DestinationSearchScreen(),
                                  ),
                                );
                              },
                            ),

                            const SizedBox(height: 12),

                            // Context headline & View Mode Switcher
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
                                        style: TextStyle(
                                          fontSize: 16.0,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: -0.3,
                                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        '${state.searchContextLabel} • ${state.distanceReferenceNote}',
                                        style: TextStyle(
                                          fontSize: 12.0,
                                          fontWeight: FontWeight.w400,
                                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                          letterSpacing: -0.1,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 10),
                                // View Switcher (List / Map)
                                ParkingViewSwitcher(
                                  currentMode: state.viewMode,
                                  onModeChanged: (mode) => notifier.setViewMode(mode),
                                ),
                              ],
                            ),

                            const SizedBox(height: 10),

                            // Radius Selector + Reset Area Row
                            Row(
                              children: [
                                const Expanded(
                                  child: ParkingRadiusSelector(isCompact: true),
                                ),
                                if (state.isCustomSearchArea) ...[
                                  const SizedBox(width: 8),
                                  PrakaroButton.tonal(
                                    label: 'Near me',
                                    icon: PrakaroIconData.nearMe,
                                    size: PrakaroButtonSize.small,
                                    onPressed: () => notifier.searchNearUser(),
                                  ),
                                ],
                              ],
                            ),

                            // In-flight loading indicator when results are already present
                            if (state.isLoading && state.locations.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(2),
                                child: LinearProgressIndicator(
                                  minHeight: 2,
                                  backgroundColor: isDark ? const Color(0xFF222834) : const Color(0xFFE9EDF2),
                                  color: AppTheme.primaryBlue,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),

                    if (state.discoverySettings.displayEnabled)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: ParkingDiscoveryControl(),
                        ),
                      ),

                    // B. Horizontally Scrollable Filter Chips Bar
                    if (state.status == ParkingMapStatus.loaded || state.locations.isNotEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.only(bottom: 8.0),
                          child: ParkingFilterBar(),
                        ),
                      ),

                    // C. Stale Results Notice Banner
                    if (state.isStaleResults && state.staleNotice != null)
                      SliverToBoxAdapter(
                        child: _buildStaleNoticeBanner(context, state, notifier, isDark),
                      ),

                    // D. Results Count Subheader (When loaded)
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
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: -0.1,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                ),
                              ),
                              Text(
                                'Nearest first',
                                style: TextStyle(
                                  fontSize: 12.0,
                                  fontWeight: FontWeight.w600,
                                  color: AppTheme.primaryBlue,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                    // E. State Routing & Results List
                    if (state.status == ParkingMapStatus.locationPermissionRequired)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildPermissionView(context, ref, notifier, isDark),
                      )
                    else if (state.status == ParkingMapStatus.locationUnavailable)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildLocationDisabledView(context, ref, notifier, isDark),
                      )
                    else if (state.status == ParkingMapStatus.backendUnavailable && state.locations.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildBackendErrorView(context, notifier, state, isDark),
                      )
                    else if (state.status == ParkingMapStatus.error && state.locations.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildGenericErrorView(context, notifier, state, isDark),
                      )
                    else if (state.isLoading && state.locations.isEmpty)
                      const SliverToBoxAdapter(
                        child: ParkingLoadingState(),
                      )
                    else if (state.isVerifiedEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: ParkingEmptyState(
                          title: 'No verified parking found',
                          message: 'Try All Candidates to see other parking that matches your filters.',
                          onRetry: () => notifier.setDiscoveryMode(ParkingDiscoveryMode.allCandidates),
                          retryLabel: 'Show All Candidates',
                        ),
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
                      // Scrollable List of Clean Parking Cards
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
                                  verificationUnavailable: !state.verificationAvailable,
                                  onTap: () => _showDetailsSheet(
                                    context,
                                    item.location,
                                    item.distanceMeters,
                                    !state.verificationAvailable,
                                  ),
                                ),
                              );
                            },
                            childCount: filteredItems.length,
                          ),
                        ),
                      ),

                      // Google Attribution Footer
                      const SliverToBoxAdapter(
                        child: GoogleAttributionFooter(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
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
            'None of the ${state.locations.length} facilities within ${state.searchRadiusKm} km have verified free parking.',
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
            'None of the ${state.locations.length} facilities within ${state.searchRadiusKm} km have verified paid parking.',
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
            'Public access classifications are not currently available for these facilities.',
        onClearFilters: () => notifier.clearFilters(),
        onIncreaseRadius: state.canIncreaseRadius ? () => notifier.increaseRadius() : null,
        increaseRadiusLabel: 'Search within ${state.nextRadiusMeters ~/ 1000} km',
        onRetry: () => notifier.refresh(),
      );
    }

    return ParkingEmptyState(
      title: 'No matching parking facilities',
      message: 'No facilities match your active filters. Try clearing filters or widening your radius.',
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
    bool isDark,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: PrakaroCard(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.accentSoftDark : AppTheme.accentSoftLight,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: PrakaroIcon(
                  PrakaroIconData.locationPin,
                  size: 26,
                  color: AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Find parking near you',
                style: TextStyle(
                  fontSize: 17.0,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Allow location access to discover nearby parking facilities around your current position.',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              PrakaroButton.primary(
                label: 'Allow Location Access',
                icon: PrakaroIconData.nearMe,
                onPressed: () => notifier.init(force: true),
              ),
              const SizedBox(height: 8),
              PrakaroButton.ghost(
                label: 'Open Device Settings',
                onPressed: () => ref.read(locationServiceProvider).openAppSettings(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLocationDisabledView(
    BuildContext context,
    WidgetRef ref,
    ParkingMapNotifier notifier,
    bool isDark,
  ) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: PrakaroCard(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.errorSoftDark : AppTheme.errorSoftLight,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: PrakaroIcon(
                  PrakaroIconData.locationPin,
                  size: 26,
                  color: AppTheme.errorRed,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Location is turned off',
                style: TextStyle(
                  fontSize: 17.0,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Turn on location services in device settings to detect nearby parking facilities.',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              PrakaroButton.primary(
                label: 'Open Location Settings',
                icon: PrakaroIconData.nearMe,
                onPressed: () => ref.read(locationServiceProvider).openLocationSettings(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStaleNoticeBanner(
    BuildContext context,
    ParkingMapState state,
    ParkingMapNotifier notifier,
    bool isDark,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E2432) : const Color(0xFFF1F4FA),
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
        ),
      ),
      child: Row(
        children: [
          PrakaroIcon(
            PrakaroIconData.info,
            size: 16,
            color: AppTheme.primaryBlue,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              state.staleNotice ?? 'Showing previous results. Refresh to try again.',
              style: TextStyle(
                fontSize: 12.0,
                fontWeight: FontWeight.w500,
                color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => notifier.refresh(),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              child: Text(
                'Refresh',
                style: TextStyle(
                  fontSize: 12.0,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue,
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
    bool isDark,
  ) {
    String title = 'Parking service unavailable';
    String message = state.errorMessage ??
        'Parking discovery is temporarily unavailable. Please verify connection and try again.';
    PrakaroIconData icon = PrakaroIconData.info;
    String buttonLabel = 'Retry Connection';

    if (state.isOffline) {
      title = "You're offline";
      message = "You're offline. Connect to the internet to search for parking.";
      buttonLabel = 'Retry';
    } else if (state.isTimedOut) {
      title = 'Search timed out';
      message = 'This search is taking longer than expected.';
      icon = PrakaroIconData.clock;
      buttonLabel = 'Try Again';
    } else if (state.isRateLimited) {
      title = 'Too many searches';
      message = 'Too many searches. Please wait a moment.';
      buttonLabel = 'Wait & Retry';
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: PrakaroCard(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.errorSoftDark : AppTheme.errorSoftLight,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: PrakaroIcon(icon, size: 26, color: AppTheme.errorRed),
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: TextStyle(
                  fontSize: 17.0,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              PrakaroButton.primary(
                label: buttonLabel,
                icon: PrakaroIconData.refresh,
                onPressed: () => notifier.refresh(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGenericErrorView(
    BuildContext context,
    ParkingMapNotifier notifier,
    ParkingMapState state,
    bool isDark,
  ) {
    String title = 'Something went wrong';
    String message =
        state.errorMessage ?? 'An error occurred while finding parking. Please try again.';
    PrakaroIconData icon = PrakaroIconData.info;
    String buttonLabel = 'Try Again';

    if (state.isOffline) {
      title = "You're offline";
      message = "You're offline. Connect to the internet to search for parking.";
      buttonLabel = 'Retry';
    } else if (state.isTimedOut) {
      title = 'Search timed out';
      message = 'This search is taking longer than expected.';
      icon = PrakaroIconData.clock;
    } else if (state.isRateLimited) {
      title = 'Too many searches';
      message = 'Too many searches. Please wait a moment.';
      buttonLabel = 'Wait & Retry';
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: PrakaroCard(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.errorSoftDark : AppTheme.errorSoftLight,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: PrakaroIcon(icon, size: 26, color: AppTheme.errorRed),
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: TextStyle(
                  fontSize: 17.0,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              PrakaroButton.primary(
                label: buttonLabel,
                icon: PrakaroIconData.refresh,
                onPressed: () => notifier.refresh(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
