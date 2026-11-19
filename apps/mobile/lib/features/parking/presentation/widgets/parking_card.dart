import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/services/navigation_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/parking_location.dart';
import '../parking_providers.dart';
import '../saved_providers.dart';

/// Refined, accessible card displaying a single discovered parking facility.
class ParkingCard extends ConsumerStatefulWidget {
  const ParkingCard({
    super.key,
    required this.location,
    this.distanceMeters,
    this.onTap,
  });

  final ParkingLocation location;
  final double? distanceMeters;
  final VoidCallback? onTap;

  @override
  ConsumerState<ParkingCard> createState() => _ParkingCardState();
}

class _ParkingCardState extends ConsumerState<ParkingCard> {
  DateTime? _lastLaunchTime;
  bool _isLaunching = false;

  Future<void> _handleDirections() async {
    final now = DateTime.now();
    if (_lastLaunchTime != null && now.difference(_lastLaunchTime!).inMilliseconds < 1200) {
      return;
    }
    _lastLaunchTime = now;

    if (_isLaunching) return;
    setState(() => _isLaunching = true);

    AppHaptics.lightImpact();

    try {
      final nav = ref.read(navigationServiceProvider);
      final launched = await nav.openDirections(
        destinationLatitude: widget.location.latitude,
        destinationLongitude: widget.location.longitude,
        destinationLabel: widget.location.name,
      );

      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not open external navigation application.'),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLaunching = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final loc = widget.location;

    final displayName = loc.name.trim().isEmpty
        ? 'Parking Facility'
        : loc.name.trim();

    final displayAddress = loc.address.trim().isEmpty
        ? 'Address unavailable'
        : loc.address.trim();

    final formattedDistance = widget.distanceMeters != null
        ? '${ParkingMapState.formatDistance(widget.distanceMeters)} (straight-line)'
        : 'Distance unavailable';

    final isSaved = ref.watch(savedParkingRefsProvider).any((r) => r.id == loc.id);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 1. Facility Header: Parking Emblem + Name & Address
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // High-contrast recognizable parking badge
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'P',
                      style: TextStyle(
                        color: colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w900,
                        fontSize: 20,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Facility Title & Address
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                            color: colorScheme.onSurface,
                            height: 1.25,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 2.0),
                              child: Icon(
                                Icons.place_outlined,
                                size: 14,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                displayAddress,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                  height: 1.3,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Bookmark / Save Action
                  IconButton(
                    icon: Icon(
                      isSaved ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
                      color: isSaved ? colorScheme.primary : colorScheme.onSurfaceVariant,
                      size: 22,
                    ),
                    tooltip: isSaved ? 'Remove from saved' : 'Save parking',
                    style: IconButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(36, 36),
                    ),
                    onPressed: () {
                      AppHaptics.lightImpact();
                      ref.read(savedParkingRefsProvider.notifier).toggleSave(widget.location);
                    },
                  ),
                ],
              ),

              // 2. Verified Metadata Badges Row (Pricing, Opening Status, Access)
              const SizedBox(height: 10),
              Wrap(
                spacing: 6.0,
                runSpacing: 4.0,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  // Pricing Badge
                  if (loc.isConfirmedFree)
                    _VerifiedInfoBadge(
                      label: 'Free parking',
                      icon: Icons.money_off_rounded,
                      backgroundColor: Colors.green.withValues(alpha: 0.12),
                      textColor: Colors.green.shade800,
                    )
                  else if (loc.isConfirmedPaid)
                    _VerifiedInfoBadge(
                      label: 'Paid parking',
                      icon: Icons.payments_outlined,
                      backgroundColor: colorScheme.secondaryContainer.withValues(alpha: 0.6),
                      textColor: colorScheme.onSecondaryContainer,
                    )
                  else if (loc.pricingType == PricingType.mixed)
                    _VerifiedInfoBadge(
                      label: 'Mixed parking',
                      icon: Icons.tune_rounded,
                      backgroundColor: Colors.purple.withValues(alpha: 0.12),
                      textColor: Colors.purple.shade800,
                    )
                  else
                    _VerifiedInfoBadge(
                      label: 'Price unlisted',
                      icon: Icons.help_outline_rounded,
                      backgroundColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                      textColor: colorScheme.onSurfaceVariant,
                    ),

                  // Opening Status Badge
                  if (loc.isConfirmedOpen)
                    _VerifiedInfoBadge(
                      label: 'Open now',
                      icon: Icons.check_circle_outline_rounded,
                      backgroundColor: Colors.teal.withValues(alpha: 0.12),
                      textColor: Colors.teal.shade800,
                    )
                  else if (loc.isConfirmedClosed)
                    _VerifiedInfoBadge(
                      label: 'Closed',
                      icon: Icons.cancel_outlined,
                      backgroundColor: Colors.red.withValues(alpha: 0.12),
                      textColor: Colors.red.shade800,
                    ),

                  // Public Access Badge (if confirmed)
                  if (loc.isConfirmedPublic)
                    _VerifiedInfoBadge(
                      label: 'Public access',
                      icon: Icons.lock_open_rounded,
                      backgroundColor: Colors.blue.withValues(alpha: 0.12),
                      textColor: Colors.blue.shade800,
                    ),
                ],
              ),

              const SizedBox(height: 10),

              // 3. Distance & Directions Action Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Distance label
                  Flexible(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.near_me_outlined,
                          size: 14,
                          color: colorScheme.primary,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            formattedDistance,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.1,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: 12),

                  // Directions Action Button
                  FilledButton.tonalIcon(
                    icon: _isLaunching
                        ? SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: colorScheme.onSecondaryContainer,
                            ),
                          )
                        : const Icon(Icons.directions_rounded, size: 16),
                    label: const Text('Directions'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      minimumSize: const Size(0, 38),
                      textStyle: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    onPressed: _isLaunching ? null : () => _handleDirections(),
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

class _VerifiedInfoBadge extends StatelessWidget {
  const _VerifiedInfoBadge({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.textColor,
  });

  final String label;
  final IconData icon;
  final Color backgroundColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 3.5),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: textColor),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: textColor,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}
