import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    AppHaptics.lightImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear all saved parking?'),
        content: const Text(
          'This will remove all saved parking facilities from your device. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Clear all'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      AppHaptics.lightImpact();
      await ref.read(savedParkingRefsProvider.notifier).clearAll();
    }
  }

  Future<void> _confirmClearRecentSearches() async {
    AppHaptics.lightImpact();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear search history?'),
        content: const Text(
          'This will delete all recent searches stored locally on your device.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Clear all'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      AppHaptics.lightImpact();
      await ref.read(recentSearchesProvider.notifier).clearAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final savedRefs = ref.watch(savedParkingRefsProvider);
    final recentState = ref.watch(recentSearchesProvider);

    // Auto-resolve when saved refs change or screen is viewed
    ref.listen<List<SavedParkingRef>?>(savedParkingRefsProvider, (previous, next) {
      if (next != null && next.isNotEmpty) {
        ref.read(savedFacilityResolverProvider.notifier).resolveAll(next);
      }
    });

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saved parking',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
            Text(
              "Quick access to parking you've bookmarked.",
              style: theme.textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        toolbarHeight: 68,
        elevation: 0,
        scrolledUnderElevation: 2,
        actions: [
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
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Segmented Tab Selector
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: SizedBox(
                width: double.infinity,
                child: SegmentedButton<int>(
                  segments: [
                    ButtonSegment<int>(
                      value: 0,
                      icon: const Icon(Icons.bookmark_rounded, size: 16),
                      label: Text('Saved (${savedRefs.length})'),
                    ),
                    ButtonSegment<int>(
                      value: 1,
                      icon: const Icon(Icons.history_rounded, size: 16),
                      label: Text('Recent (${recentState.searches.length})'),
                    ),
                  ],
                  selected: {_selectedTabIndex},
                  onSelectionChanged: (selected) {
                    AppHaptics.selection();
                    setState(() => _selectedTabIndex = selected.first);
                    if (selected.first == 0) {
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
    final colorScheme = theme.colorScheme;
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
                  color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.bookmark_outline_rounded,
                  size: 32,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'No saved parking yet.',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Save parking locations to find them again quickly.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
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
                style: theme.textTheme.labelMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextButton(
                onPressed: onClearAll,
                child: const Text('Clear all'),
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
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11,
                        color: colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
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
    final colorScheme = theme.colorScheme;
    final status = resolution?.status ?? SavedItemStatus.loading;
    final location = resolution?.location;

    // 1. Loading State
    if (status == SavedItemStatus.loading) {
      return Card(
        elevation: 0,
        color: colorScheme.surfaceContainerLow,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colorScheme.primary,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  'Loading facility details...',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.bookmark_remove_rounded, size: 20),
                tooltip: 'Remove from saved',
                onPressed: () {
                  AppHaptics.lightImpact();
                  ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
                },
              ),
            ],
          ),
        ),
      );
    }

    // 2. Place Not Found State (404)
    if (status == SavedItemStatus.notFound) {
      return Card(
        elevation: 0,
        color: colorScheme.errorContainer.withValues(alpha: 0.3),
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.location_off_outlined, color: colorScheme.error, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Facility no longer available',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: colorScheme.onErrorContainer,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'This parking location was removed or is no longer listed.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colorScheme.onErrorContainer,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded, size: 20),
                tooltip: 'Remove from saved',
                color: colorScheme.error,
                onPressed: () {
                  AppHaptics.lightImpact();
                  ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
                },
              ),
            ],
          ),
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
      final isOffline = status == SavedItemStatus.offline;

      return Card(
        elevation: 0,
        color: colorScheme.surfaceContainerLow,
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    isOffline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
                    size: 20,
                    color: colorScheme.error,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      message,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurface,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    icon: const Icon(Icons.refresh_rounded, size: 16),
                    label: const Text('Retry'),
                    onPressed: () {
                      AppHaptics.lightImpact();
                      ref.read(savedFacilityResolverProvider.notifier).resolveSingle(
                            refItem.id,
                            force: true,
                          );
                    },
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    icon: const Icon(Icons.bookmark_remove_rounded, size: 16),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(
                      foregroundColor: colorScheme.error,
                    ),
                    onPressed: () {
                      AppHaptics.lightImpact();
                      ref.read(savedParkingRefsProvider.notifier).remove(refItem.id);
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }

    // 4. Fully Loaded Facility Card
    final displayName = location.name.trim().isNotEmpty ? location.name.trim() : 'Parking Facility';
    final displayAddress =
        location.address.trim().isNotEmpty ? location.address.trim() : 'Address unavailable';

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => onTapDetails(location),
        child: Padding(
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
                      color: colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'P',
                      style: TextStyle(
                        color: colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          displayAddress,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.bookmark_rounded),
                    color: colorScheme.primary,
                    tooltip: 'Remove from saved',
                    onPressed: () {
                      AppHaptics.lightImpact();
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
                      backgroundColor: Colors.green.withValues(alpha: 0.12),
                      textColor: Colors.green.shade800,
                    )
                  else if (location.isConfirmedPaid)
                    _Badge(
                      label: 'Paid',
                      backgroundColor: colorScheme.secondaryContainer.withValues(alpha: 0.6),
                      textColor: colorScheme.onSecondaryContainer,
                    ),
                  if (location.isConfirmedOpen)
                    _Badge(
                      label: 'Open now',
                      backgroundColor: Colors.teal.withValues(alpha: 0.12),
                      textColor: Colors.teal.shade800,
                    )
                  else if (location.isConfirmedClosed)
                    _Badge(
                      label: 'Closed',
                      backgroundColor: Colors.red.withValues(alpha: 0.12),
                      textColor: Colors.red.shade800,
                    ),
                  if (location.isConfirmedPublic)
                    _Badge(
                      label: 'Public',
                      backgroundColor: Colors.blue.withValues(alpha: 0.12),
                      textColor: Colors.blue.shade800,
                    ),
                ],
              ),

              const SizedBox(height: 12),

              // Action Buttons Row
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => onTapDetails(location),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      minimumSize: const Size(0, 36),
                    ),
                    child: const Text('Details'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.directions_rounded, size: 16),
                    label: const Text('Directions'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      minimumSize: const Size(0, 36),
                    ),
                    onPressed: () => onDirections(location),
                  ),
                ],
              ),
            ],
          ),
        ),
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
    final colorScheme = theme.colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Privacy Control Card
        Card(
          elevation: 0,
          color: colorScheme.surfaceContainerLow,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            side: BorderSide(
              color: colorScheme.outlineVariant.withValues(alpha: 0.5),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.security_rounded,
                          size: 18,
                          color: colorScheme.primary,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Recent search history',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    Switch(
                      value: state.isRecordingEnabled,
                      onChanged: (val) {
                        AppHaptics.selection();
                        ref.read(recentSearchesProvider.notifier).setRecordingEnabled(val);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Stores your explicit search areas locally on this device for quick reuse. '
                  'Searches are never uploaded to our servers or shared.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 12),

        // History Content
        if (!state.isRecordingEnabled && state.searches.isEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40.0, horizontal: 24.0),
            child: Column(
              children: [
                Icon(
                  Icons.history_toggle_off_rounded,
                  size: 48,
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                ),
                const SizedBox(height: 14),
                Text(
                  'Search history is turned off',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Turn on the switch above to save areas you search for fast one-tap reuse.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
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
                Icon(
                  Icons.history_rounded,
                  size: 48,
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                ),
                const SizedBox(height: 14),
                Text(
                  'No recent searches.',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Your recent searches will appear here when history is enabled.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
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
                style: theme.textTheme.labelMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              ),
              TextButton(
                onPressed: onClearAll,
                child: const Text('Clear all'),
              ),
            ],
          ),

          const SizedBox(height: 6),

          // Recent Search Items
          for (final search in state.searches)
            Padding(
              padding: const EdgeInsets.only(bottom: 8.0),
              child: Card(
                elevation: 0,
                color: colorScheme.surfaceContainerLow,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
                  child: Row(
                    children: [
                      Icon(
                        Icons.history_rounded,
                        color: colorScheme.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              search.label,
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Within ${(search.radiusMeters / 1000).toStringAsFixed(0)} km · ${_formatRelativeTime(search.createdAt)}',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      FilledButton.tonal(
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          minimumSize: const Size(0, 36),
                        ),
                        onPressed: () {
                          AppHaptics.lightImpact();
                          // Restore search center & radius and trigger fresh backend search
                          ref.read(parkingMapProvider.notifier).searchFromRecent(
                                latitude: search.latitude,
                                longitude: search.longitude,
                                radiusMeters: search.radiusMeters,
                              );
                          // Switch root navigation back to Explore tab
                          ref.read(rootNavigationIndexProvider.notifier).setIndex(0);
                        },
                        child: const Text('Search area'),
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, size: 18),
                        tooltip: 'Remove search',
                        onPressed: () {
                          AppHaptics.lightImpact();
                          ref.read(recentSearchesProvider.notifier).remove(search.id);
                        },
                      ),
                    ],
                  ),
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
      padding: const EdgeInsets.symmetric(horizontal: 7.0, vertical: 2.5),
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
