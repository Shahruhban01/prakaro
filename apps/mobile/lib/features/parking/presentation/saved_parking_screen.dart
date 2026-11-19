import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/components/prakaro_button.dart';
import '../../../core/design/components/prakaro_card.dart';
import '../../../core/design/components/prakaro_dialog.dart';
import '../../../core/design/components/prakaro_header.dart';
import '../../../core/design/components/prakaro_loading.dart';
import '../../../core/design/components/prakaro_segmented_control.dart';
import '../../../core/design/prakaro_icons.dart';
import '../../../core/services/navigation_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/screens/profile_screen.dart';
import '../domain/parking_location.dart';
import '../domain/saved_parking_ref.dart';
import 'parking_providers.dart';
import 'saved_providers.dart';
import 'widgets/parking_details_sheet.dart';

/// Screen managing user-saved parking facilities, recent search origins, and privacy controls.
class SavedParkingScreen extends ConsumerStatefulWidget {
  const SavedParkingScreen({super.key});

  @override
  ConsumerState<SavedParkingScreen> createState() => _SavedParkingScreenState();
}

class _SavedParkingScreenState extends ConsumerState<SavedParkingScreen> {
  int _selectedTabIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _resolveSavedFacilities();
    });
  }

  void _resolveSavedFacilities() {
    final refs = ref.read(savedParkingRefsProvider);
    if (refs.isNotEmpty) {
      ref.read(savedFacilityResolverProvider.notifier).resolveAll(refs);
    }
  }

  void _showDetailsSheet(BuildContext context, ParkingLocation location) {
    AppHaptics.lightImpact();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ParkingDetailsSheet(
        location: location,
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  Future<void> _handleDirections(ParkingLocation location) async {
    AppHaptics.lightImpact();
    final nav = ref.read(navigationServiceProvider);
    final launched = await nav.openDirections(
      destinationLatitude: location.latitude,
      destinationLongitude: location.longitude,
      destinationLabel: location.name,
    );

    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open external navigation application.'),
          duration: Duration(seconds: 3),
        ),
      );
    }
  }

  Future<void> _confirmClearSaved() async {
    final confirmed = await PrakaroDialog.show(
      context: context,
      title: 'Clear all saved parking?',
      message: 'This will remove all saved parking facilities from your device. This cannot be undone.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Cancel',
      isDanger: true,
      icon: PrakaroIconData.trash,
    );

    if (confirmed == true && mounted) {
      await ref.read(savedParkingRefsProvider.notifier).clearAll();
    }
  }

  Future<void> _confirmClearRecentSearches() async {
    final confirmed = await PrakaroDialog.show(
      context: context,
      title: 'Clear search history?',
      message: 'This will delete all recent searches stored locally on your device.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Cancel',
      isDanger: true,
      icon: PrakaroIconData.trash,
    );

    if (confirmed == true && mounted) {
      await ref.read(recentSearchesProvider.notifier).clearAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final savedRefs = ref.watch(savedParkingRefsProvider);
    final recentState = ref.watch(recentSearchesProvider);

    // Auto-resolve when saved refs change or screen is viewed
    ref.listen<List<SavedParkingRef>?>(savedParkingRefsProvider, (previous, next) {
      if (next != null && next.isNotEmpty) {
        ref.read(savedFacilityResolverProvider.notifier).resolveAll(next);
      }
    });

    return Scaffold(
      backgroundColor: isDark ? AppTheme.canvasDark : Colors.white,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // Prakaro Header
            PrakaroHeader(
              title: 'Saved parking',
              subtitle: "Quick access to parking you've bookmarked",
              actions: [
                PrakaroIconButton(
                  icon: PrakaroIconData.user,
                  tooltip: 'Account',
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => const ProfileScreen()),
                    );
                  },
                ),
              ],
            ),

            // Segmented Tab Selector
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: SizedBox(
                width: double.infinity,
                child: PrakaroSegmentedControl<int>(
                  items: [
                    PrakaroSegmentItem(
                      value: 0,
                      label: 'Saved (${savedRefs.length})',
                      icon: PrakaroIconData.bookmarkFilled,
                    ),
                    PrakaroSegmentItem(
                      value: 1,
                      label: 'Recent (${recentState.searches.length})',
                      icon: PrakaroIconData.clock,
                    ),
                  ],
                  selectedValue: _selectedTabIndex,
                  onChanged: (selected) {
                    setState(() => _selectedTabIndex = selected);
                    if (selected == 0) {
                      _resolveSavedFacilities();
                    }
                  },
                ),
              ),
            ),

            // Tab Content
            Expanded(
              child: _selectedTabIndex == 0
                  ? _SavedFacilitiesView(
                      savedRefs: savedRefs,
                      onClearAll: _confirmClearSaved,
                      onTapDetails: (loc) => _showDetailsSheet(context, loc),
                      onDirections: _handleDirections,
                    )
                  : _RecentSearchesView(
                      state: recentState,
                      onClearAll: _confirmClearRecentSearches,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// View displaying user-saved parking facilities with on-demand resolution.
class _SavedFacilitiesView extends ConsumerWidget {
  const _SavedFacilitiesView({
    required this.savedRefs,
    required this.onClearAll,
    required this.onTapDetails,
    required this.onDirections,
  });

  final List<SavedParkingRef> savedRefs;
  final VoidCallback onClearAll;
  final ValueChanged<ParkingLocation> onTapDetails;
  final ValueChanged<ParkingLocation> onDirections;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final resolverState = ref.watch(savedFacilityResolverProvider);

    if (savedRefs.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E232E) : const Color(0xFFF1F3F6),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: PrakaroIcon(
                  PrakaroIconData.bookmarkOutline,
                  size: 28,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'No saved parking yet.',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  letterSpacing: -0.2,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Save parking locations to find them again quickly.',
                style: TextStyle(
                  fontSize: 14,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        // Bulk Action Bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${savedRefs.length} ${savedRefs.length == 1 ? 'place' : 'places'} saved',
                style: TextStyle(
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              PrakaroButton.ghost(
                label: 'Clear all',
                size: PrakaroButtonSize.small,
                onPressed: onClearAll,
              ),
            ],
          ),
        ),

        // Scrollable List of Saved Items
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            itemCount: savedRefs.length + 1, // +1 for Google attribution footer
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              if (index == savedRefs.length) {
                // Attribution footer adhering to Google Maps Platform requirements
                return Padding(
                  padding: const EdgeInsets.only(top: 16.0, bottom: 8.0),
                  child: Center(
                    child: Text(
                      'Parking information provided by Google Places',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark
                            ? AppTheme.textSecondaryDark.withValues(alpha: 0.7)
                            : AppTheme.textSecondaryLight.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                );
              }

              final refItem = savedRefs[index];
              final resolution = resolverState.items[refItem.id];

              return _SavedItemCard(
                refItem: refItem,
                resolution: resolution,
                onTapDetails: onTapDetails,
                onDirections: onDirections,
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Card representing a single saved reference, handling loaded, loading, and error states.
class _SavedItemCard extends ConsumerWidget {
  const _SavedItemCard({
    required this.refItem,
    required this.resolution,
    required this.onTapDetails,
    required this.onDirections,
  });

  final SavedParkingRef refItem;
  final SavedItemResolution? resolution;
  final ValueChanged<ParkingLocation> onTapDetails;
  final ValueChanged<ParkingLocation> onDirections;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final status = resolution?.status ?? SavedItemStatus.loading;
    final location = resolution?.location;

    // 1. Loading State
    if (status == SavedItemStatus.loading) {
      return PrakaroCard(
        hasShadow: false,
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            const PrakaroLoadingIndicator(size: 20, strokeWidth: 2.0),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                'Loading facility details...',
                style: TextStyle(
                  fontSize: 14,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
            ),
            PrakaroIconButton(
              icon: PrakaroIconData.bookmarkOutline,
              size: 32,
              iconSize: 16,
              tooltip: 'Remove from saved',
              onPressed: () {
                ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
              },
            ),
          ],
        ),
      );
    }

    // 2. Place Not Found State (404)
    if (status == SavedItemStatus.notFound) {
      return PrakaroCard(
        hasShadow: false,
        backgroundColor: isDark ? const Color(0xFF2E1919) : const Color(0xFFFEF2F2),
        borderColor: isDark ? const Color(0xFF4C2020) : const Color(0xFFFECACA),
        padding: const EdgeInsets.all(14.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const PrakaroIcon(
              PrakaroIconData.info,
              color: Color(0xFFDC2626),
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Facility no longer available',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: isDark ? const Color(0xFFFCA5A5) : const Color(0xFF991B1B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'This parking location was removed or is no longer listed.',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? const Color(0xFFF87171) : const Color(0xFFB91C1C),
                    ),
                  ),
                ],
              ),
            ),
            PrakaroIconButton(
              icon: PrakaroIconData.trash,
              size: 32,
              iconSize: 16,
              tooltip: 'Remove from saved',
              color: const Color(0xFFDC2626),
              onPressed: () {
                ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
              },
            ),
          ],
        ),
      );
    }

    // 3. Offline / Network / Timeout / Rate Limited States
    if (status == SavedItemStatus.offline ||
        status == SavedItemStatus.timeout ||
        status == SavedItemStatus.rateLimited ||
        status == SavedItemStatus.error ||
        location == null) {
      final message = resolution?.errorMessage ?? 'Could not load parking details.';

      return PrakaroCard(
        hasShadow: false,
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const PrakaroIcon(
                  PrakaroIconData.info,
                  size: 18,
                  color: Color(0xFFDC2626),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    message,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                PrakaroButton.ghost(
                  label: 'Retry',
                  size: PrakaroButtonSize.small,
                  icon: PrakaroIconData.refresh,
                  onPressed: () {
                    ref.read(savedFacilityResolverProvider.notifier).resolveSingle(
                          refItem.id,
                          force: true,
                        );
                  },
                ),
                const SizedBox(width: 8),
                PrakaroButton.danger(
                  label: 'Remove',
                  size: PrakaroButtonSize.small,
                  icon: PrakaroIconData.trash,
                  onPressed: () {
                    ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
                  },
                ),
              ],
            ),
          ],
        ),
      );
    }

    // 4. Fully Loaded Facility Card
    final displayName = location.name.trim().isNotEmpty ? location.name.trim() : 'Parking Facility';
    final displayAddress =
        location.address.trim().isNotEmpty ? location.address.trim() : 'Address unavailable';

    return PrakaroCard(
      onTap: () => onTapDetails(location),
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.canvasDark : AppTheme.accentSoftLight,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                    width: 1.0,
                  ),
                ),
                alignment: Alignment.center,
                child: const PrakaroIcon(
                  PrakaroIconData.parking,
                  size: 20,
                  color: AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        letterSpacing: -0.2,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      displayAddress,
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              PrakaroIconButton(
                icon: PrakaroIconData.bookmarkFilled,
                color: AppTheme.primaryBlue,
                tooltip: 'Remove from saved',
                size: 34,
                iconSize: 18,
                onPressed: () {
                  ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
                },
              ),
            ],
          ),

          const SizedBox(height: 10),

          // Badges Row
          Wrap(
            spacing: 6.0,
            runSpacing: 4.0,
            children: [
              if (location.isConfirmedFree)
                _Badge(
                  label: 'Free',
                  backgroundColor: isDark ? const Color(0xFF132E22) : const Color(0xFFEDF8F3),
                  textColor: const Color(0xFF27845B),
                )
              else if (location.isConfirmedPaid)
                _Badge(
                  label: 'Paid',
                  backgroundColor: isDark ? const Color(0xFF2B2215) : const Color(0xFFFDF6EC),
                  textColor: const Color(0xFFC0700B),
                ),
              if (location.isConfirmedOpen)
                _Badge(
                  label: 'Open now',
                  backgroundColor: isDark ? const Color(0xFF132E22) : const Color(0xFFEDF8F3),
                  textColor: const Color(0xFF27845B),
                )
              else if (location.isConfirmedClosed)
                _Badge(
                  label: 'Closed',
                  backgroundColor: isDark ? const Color(0xFF2E1919) : const Color(0xFFFEF2F2),
                  textColor: const Color(0xFFDC2626),
                ),
              if (location.isConfirmedPublic)
                _Badge(
                  label: 'Public',
                  backgroundColor: isDark ? const Color(0xFF182236) : AppTheme.accentSoftLight,
                  textColor: AppTheme.primaryBlue,
                ),
            ],
          ),

          const SizedBox(height: 14),

          // Action Buttons Row
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              PrakaroButton.outline(
                label: 'Details',
                size: PrakaroButtonSize.small,
                onPressed: () => onTapDetails(location),
              ),
              const SizedBox(width: 8),
              PrakaroButton.primary(
                label: 'Directions',
                size: PrakaroButtonSize.small,
                icon: PrakaroIconData.directions,
                onPressed: () => onDirections(location),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// View managing recent search history and privacy settings.
class _RecentSearchesView extends ConsumerWidget {
  const _RecentSearchesView({
    required this.state,
    required this.onClearAll,
  });

  final RecentSearchesState state;
  final VoidCallback onClearAll;

  String _formatRelativeTime(DateTime dateTime) {
    final now = DateTime.now().toUtc();
    final difference = now.difference(dateTime);

    if (difference.inMinutes < 1) {
      return 'Just now';
    } else if (difference.inHours < 1) {
      return '${difference.inMinutes}m ago';
    } else if (difference.inDays < 1) {
      return '${difference.inHours}h ago';
    } else if (difference.inDays == 1) {
      return 'Yesterday';
    } else {
      return '${difference.inDays}d ago';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Privacy Control Card
        PrakaroCard(
          hasShadow: false,
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const PrakaroIcon(
                        PrakaroIconData.shield,
                        size: 18,
                        color: AppTheme.primaryBlue,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Recent search history',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        ),
                      ),
                    ],
                  ),
                  Switch.adaptive(
                    value: state.isRecordingEnabled,
                    activeTrackColor: AppTheme.primaryBlue,
                    onChanged: (val) {
                      ref.read(recentSearchesProvider.notifier).setRecordingEnabled(val);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Stores your explicit search areas locally on this device for quick reuse. '
                'Searches are never uploaded to our servers or shared.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // History Content
        if (!state.isRecordingEnabled && state.searches.isEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40.0, horizontal: 24.0),
            child: Column(
              children: [
                PrakaroIcon(
                  PrakaroIconData.clock,
                  size: 44,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
                const SizedBox(height: 14),
                Text(
                  'Search history is turned off',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Turn on the switch above to save areas you search for fast one-tap reuse.',
                  style: TextStyle(
                    fontSize: 13,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ] else if (state.searches.isEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40.0, horizontal: 24.0),
            child: Column(
              children: [
                PrakaroIcon(
                  PrakaroIconData.clock,
                  size: 44,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
                const SizedBox(height: 14),
                Text(
                  'No recent searches.',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Your recent searches will appear here when history is enabled.',
                  style: TextStyle(
                    fontSize: 13,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ] else ...[
          // Action Bar
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${state.searches.length} recent ${state.searches.length == 1 ? 'search' : 'searches'}',
                style: TextStyle(
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              PrakaroButton.ghost(
                label: 'Clear all',
                size: PrakaroButtonSize.small,
                onPressed: onClearAll,
              ),
            ],
          ),

          const SizedBox(height: 6),

          // Recent Search Items
          for (final search in state.searches)
            Padding(
              padding: const EdgeInsets.only(bottom: 8.0),
              child: PrakaroCard(
                hasShadow: false,
                padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: isDark ? AppTheme.canvasDark : const Color(0xFFF1F3F6),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const PrakaroIcon(
                        PrakaroIconData.clock,
                        color: AppTheme.primaryBlue,
                        size: 16,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            search.label,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Within ${(search.radiusMeters / 1000).toStringAsFixed(0)} km · ${_formatRelativeTime(search.createdAt)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PrakaroButton.tonal(
                      label: 'Search area',
                      size: PrakaroButtonSize.small,
                      onPressed: () {
                        // Restore search center & radius and trigger fresh backend search
                        ref.read(parkingMapProvider.notifier).searchFromRecent(
                              latitude: search.latitude,
                              longitude: search.longitude,
                              radiusMeters: search.radiusMeters,
                            );
                        // Switch root navigation back to Explore tab
                        ref.read(rootNavigationIndexProvider.notifier).setIndex(0);
                      },
                    ),
                    const SizedBox(width: 4),
                    PrakaroIconButton(
                      icon: PrakaroIconData.close,
                      size: 32,
                      iconSize: 14,
                      tooltip: 'Remove search',
                      onPressed: () {
                        ref.read(recentSearchesProvider.notifier).remove(search.id);
                      },
                    ),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.label,
    required this.backgroundColor,
    required this.textColor,
  });

  final String label;
  final Color backgroundColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 3.0),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }
}
