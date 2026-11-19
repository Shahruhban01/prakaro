import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/components/prakaro_card.dart';
import '../../../../core/design/components/prakaro_sheet.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/services/navigation_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/widgets/auth_prompt_bottom_sheet.dart';
import '../../domain/parking_location.dart';
import '../saved_providers.dart';
import 'parking_photo_gallery.dart';

/// Modal bottom sheet presenting verified facility metadata, photo gallery,
/// and direct navigation trigger in a refined consumer interface.
class ParkingDetailsSheet extends ConsumerStatefulWidget {
  const ParkingDetailsSheet({
    super.key,
    required this.location,
    this.distanceMeters,
    required this.onClose,
  });

  final ParkingLocation location;
  final double? distanceMeters;
  final VoidCallback onClose;

  @override
  ConsumerState<ParkingDetailsSheet> createState() => _ParkingDetailsSheetState();
}

class _ParkingDetailsSheetState extends ConsumerState<ParkingDetailsSheet> {
  DateTime? _lastLaunchTime;
  bool _isLaunching = false;

  String _formatDistance(double meters) {
    if (meters < 1000) {
      return '${meters.round()} m';
    }
    final km = meters / 1000;
    return '${km.toStringAsFixed(1)} km';
  }

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

    final isSaved = ref.watch(savedParkingRefsProvider).any((r) => r.id == loc.id);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: PrakaroSheet(
        showDragHandle: true,
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Scrollable Content
            Flexible(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // 1. Photo Gallery Carousel
                    ParkingPhotoGallery(
                      parkingId: loc.id,
                      facilityName: displayName,
                    ),
                    const SizedBox(height: 16),

                    // 2. Header Row: Name & Action Controls
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                displayName,
                                style: TextStyle(
                                  fontSize: 19.0,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.4,
                                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                                  height: 1.25,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (widget.distanceMeters != null) ...[
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    PrakaroIcon(
                                      PrakaroIconData.nearMe,
                                      size: 13.0,
                                      color: AppTheme.primaryBlue,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      '${_formatDistance(widget.distanceMeters!)} away (straight-line)',
                                      style: TextStyle(
                                        fontSize: 13.0,
                                        fontWeight: FontWeight.w600,
                                        color: AppTheme.primaryBlue,
                                        letterSpacing: -0.1,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),

                        // Bookmark Save Action
                        PrakaroIconButton(
                          icon: isSaved ? PrakaroIconData.bookmarkFilled : PrakaroIconData.bookmarkOutline,
                          color: isSaved
                              ? AppTheme.primaryBlue
                              : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                          backgroundColor: isDark ? const Color(0xFF222834) : const Color(0xFFF1F3F6),
                          tooltip: isSaved ? 'Remove from saved' : 'Save parking',
                          onPressed: () {
                            AppHaptics.lightImpact();
                            ref.read(savedParkingRefsProvider.notifier).toggleSave(loc);
                            if (ref.read(authProvider).isGuest && !isSaved) {
                              AuthPromptBottomSheet.show(context, facilityName: loc.name);
                            }
                          },
                        ),
                        const SizedBox(width: 8),

                        // Close Button
                        PrakaroIconButton(
                          icon: PrakaroIconData.close,
                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          backgroundColor: isDark ? const Color(0xFF222834) : const Color(0xFFF1F3F6),
                          tooltip: 'Close details',
                          onPressed: widget.onClose,
                        ),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // 3. Address Card
                    PrakaroCard(
                      hasShadow: false,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      backgroundColor: isDark ? const Color(0xFF161920) : const Color(0xFFF7F8FA),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2.0),
                            child: PrakaroIcon(
                              PrakaroIconData.locationPin,
                              size: 16.0,
                              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              displayAddress,
                              style: TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w400,
                                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                height: 1.38,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // 4. Verified Facility Attributes (Pricing, Hours, Access)
                    PrakaroCard(
                      hasShadow: false,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      backgroundColor: isDark ? const Color(0xFF161920) : const Color(0xFFF7F8FA),
                      child: Column(
                        children: [
                          _DetailRow(
                            icon: PrakaroIconData.payments,
                            label: 'Pricing',
                            value: _buildPricingLabel(loc),
                            valueColor: _buildPricingColor(loc, isDark),
                          ),
                          Divider(
                            height: 20,
                            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                          ),
                          _DetailRow(
                            icon: PrakaroIconData.clock,
                            label: 'Hours',
                            value: _buildOpeningLabel(loc),
                            valueColor: _buildOpeningColor(loc, isDark),
                          ),
                          Divider(
                            height: 20,
                            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                          ),
                          _DetailRow(
                            icon: PrakaroIconData.shield,
                            label: 'Access',
                            value: _buildAccessLabel(loc),
                            valueColor: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // 5. Source Attribution
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '${loc.latitude.toStringAsFixed(4)}, ${loc.longitude.toStringAsFixed(4)}',
                            style: TextStyle(
                              fontSize: 11.0,
                              color: isDark ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLight,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Source: Google Places',
                          style: TextStyle(
                            fontSize: 11.0,
                            color: isDark ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLight,
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 18),
                  ],
                ),
              ),
            ),

            // Persistent Primary Directions Button
            PrakaroButton.primary(
              label: 'Directions',
              icon: PrakaroIconData.directions,
              size: PrakaroButtonSize.large,
              isFullWidth: true,
              isLoading: _isLaunching,
              onPressed: () => _handleDirections(),
            ),
          ],
        ),
      ),
    );
  }

  String _buildPricingLabel(ParkingLocation loc) {
    switch (loc.pricingType) {
      case PricingType.free:
        return 'Free parking';
      case PricingType.paid:
        if (loc.hourlyRate != null && loc.currency != null) {
          return '${loc.currency} ${loc.hourlyRate!.toStringAsFixed(0)} / hr';
        }
        return 'Paid parking';
      case PricingType.mixed:
        return 'Mixed rates';
      case PricingType.unknown:
        return 'Rate unlisted';
    }
  }

  Color _buildPricingColor(ParkingLocation loc, bool isDark) {
    if (loc.pricingType == PricingType.free) {
      return isDark ? const Color(0xFF34D399) : AppTheme.successGreen;
    }
    return isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight;
  }

  String _buildOpeningLabel(ParkingLocation loc) {
    switch (loc.openingStatus) {
      case OpeningStatus.open:
        return 'Open now';
      case OpeningStatus.closed:
        return 'Currently closed';
      case OpeningStatus.unknown:
        return 'Hours unlisted';
    }
  }

  Color _buildOpeningColor(ParkingLocation loc, bool isDark) {
    switch (loc.openingStatus) {
      case OpeningStatus.open:
        return isDark ? const Color(0xFF34D399) : AppTheme.successGreen;
      case OpeningStatus.closed:
        return isDark ? const Color(0xFFF87171) : AppTheme.errorRed;
      case OpeningStatus.unknown:
        return isDark ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLight;
    }
  }

  String _buildAccessLabel(ParkingLocation loc) {
    switch (loc.accessType) {
      case AccessType.public:
        return 'Public access';
      case AccessType.customersOnly:
        return 'Customers only';
      case AccessType.private:
        return 'Private parking';
      case AccessType.unknown:
        return 'General access';
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final PrakaroIconData icon;
  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Row(
      children: [
        PrakaroIcon(
          icon,
          size: 16.0,
          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
        ),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            fontSize: 13.0,
            fontWeight: FontWeight.w500,
            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            fontSize: 13.0,
            fontWeight: FontWeight.w600,
            color: valueColor,
            letterSpacing: -0.1,
          ),
        ),
      ],
    );
  }
}
