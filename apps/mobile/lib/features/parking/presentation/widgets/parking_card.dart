import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/components/prakaro_card.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/services/navigation_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/widgets/auth_prompt_bottom_sheet.dart';
import '../../domain/parking_location.dart';
import '../parking_providers.dart';
import '../saved_providers.dart';

/// Professional, human-centered card presenting a single discovered parking facility.
/// Prioritizes facility name, distance, readable address, verified attributes, and clear directions.
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
    final isDark = theme.brightness == Brightness.dark;
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

    return PrakaroCard(
      onTap: widget.onTap,
      padding: const EdgeInsets.all(AppTheme.space16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. Top Row: Facility Name & Bookmark Save Action
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Clean parking emblem
              Container(
                width: 36.0,
                height: 36.0,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.accentSoftDark : AppTheme.accentSoftLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                ),
                alignment: Alignment.center,
                child: Text(
                  'P',
                  style: TextStyle(
                    color: AppTheme.primaryBlue,
                    fontWeight: FontWeight.w800,
                    fontSize: 18.0,
                    letterSpacing: -0.5,
                    height: 1.0,
                  ),
                ),
              ),
              const SizedBox(width: 12.0),

              // Title and Distance
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      style: TextStyle(
                        fontSize: 16.0,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.3,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        height: 1.25,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3.0),
                    Row(
                      children: [
                        PrakaroIcon(
                          PrakaroIconData.nearMe,
                          size: 13.0,
                          color: AppTheme.primaryBlue,
                        ),
                        const SizedBox(width: 4.0),
                        Flexible(
                          child: Text(
                            formattedDistance,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.1,
                              color: AppTheme.primaryBlue,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Bookmark Save Button
              PrakaroIconButton(
                icon: isSaved ? PrakaroIconData.bookmarkFilled : PrakaroIconData.bookmarkOutline,
                color: isSaved
                    ? AppTheme.primaryBlue
                    : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                tooltip: isSaved ? 'Remove from saved' : 'Save parking',
                onPressed: () {
                  AppHaptics.lightImpact();
                  ref.read(savedParkingRefsProvider.notifier).toggleSave(widget.location);
                  if (ref.read(authProvider).isGuest && !isSaved) {
                    AuthPromptBottomSheet.show(context, facilityName: widget.location.name);
                  }
                },
              ),
            ],
          ),

          const SizedBox(height: 10.0),

          // 2. Address Row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2.0),
                child: PrakaroIcon(
                  PrakaroIconData.locationPin,
                  size: 14.0,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
              const SizedBox(width: 6.0),
              Expanded(
                child: Text(
                  displayAddress,
                  style: TextStyle(
                    fontSize: 13.0,
                    fontWeight: FontWeight.w400,
                    color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                    height: 1.35,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),

          // 3. Verified Information Badges (Soft Pills)
          const SizedBox(height: 10.0),
          Wrap(
            spacing: 6.0,
            runSpacing: 4.0,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (loc.pricingType == PricingType.free)
                _VerifiedBadge(
                  label: 'Free parking',
                  icon: PrakaroIconData.check,
                  isSuccess: true,
                )
              else if (loc.pricingType == PricingType.paid)
                _VerifiedBadge(
                  label: 'Paid parking',
                  icon: PrakaroIconData.payments,
                )
              else if (loc.pricingType == PricingType.mixed)
                _VerifiedBadge(
                  label: 'Mixed pricing',
                  icon: PrakaroIconData.payments,
                )
              else
                _VerifiedBadge(
                  label: 'Price unlisted',
                  isMuted: true,
                ),

              if (loc.openingStatus == OpeningStatus.open)
                _VerifiedBadge(
                  label: 'Open now',
                  icon: PrakaroIconData.clock,
                  isSuccess: true,
                )
              else if (loc.openingStatus == OpeningStatus.closed)
                _VerifiedBadge(
                  label: 'Closed',
                  isDanger: true,
                ),

              if (loc.accessType == AccessType.public)
                _VerifiedBadge(
                  label: 'Public',
                  icon: PrakaroIconData.shield,
                ),
            ],
          ),

          const SizedBox(height: 12.0),

          // 4. Bottom Divider and Action Row
          Container(
            height: 1.0,
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          ),
          const SizedBox(height: 10.0),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Approx. distance',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLight,
                ),
              ),
              PrakaroButton.primary(
                label: 'Directions',
                icon: PrakaroIconData.directions,
                size: PrakaroButtonSize.small,
                isLoading: _isLaunching,
                onPressed: () => _handleDirections(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge({
    required this.label,
    this.icon,
    this.isSuccess = false,
    this.isDanger = false,
    this.isMuted = false,
  });

  final String label;
  final PrakaroIconData? icon;
  final bool isSuccess;
  final bool isDanger;
  final bool isMuted;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Color bg;
    Color fg;

    if (isSuccess) {
      bg = isDark ? AppTheme.successSoftDark : AppTheme.successSoftLight;
      fg = isDark ? const Color(0xFF34D399) : AppTheme.successGreen;
    } else if (isDanger) {
      bg = isDark ? AppTheme.errorSoftDark : AppTheme.errorSoftLight;
      fg = isDark ? const Color(0xFFF87171) : AppTheme.errorRed;
    } else if (isMuted) {
      bg = isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F3F6);
      fg = isDark ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLight;
    } else {
      bg = isDark ? const Color(0xFF1E2432) : const Color(0xFFF0F4FA);
      fg = isDark ? const Color(0xFF90B5FF) : AppTheme.primaryBlue;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7.0, vertical: 3.5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppTheme.radiusMicro),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            PrakaroIcon(
              icon!,
              size: 11.0,
              color: fg,
            ),
            const SizedBox(width: 4.0),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11.0,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.1,
              color: fg,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
