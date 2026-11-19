import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/services/navigation_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/presentation/widgets/auth_prompt_bottom_sheet.dart';
import '../../domain/parking_location.dart';
import '../saved_providers.dart';
import 'parking_photo_gallery.dart';

/// Modal bottom sheet presenting verified facility metadata and direct navigation trigger.
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
    final colorScheme = theme.colorScheme;
    final loc = widget.location;

    final displayName = loc.name.trim().isEmpty
        ? 'Parking Facility'
        : loc.name.trim();

    final displayAddress = loc.address.trim().isEmpty
        ? 'Address unavailable'
        : loc.address.trim();

    final isSaved = ref.watch(savedParkingRefsProvider).any((r) => r.id == loc.id);

    final maxHeight = MediaQuery.sizeOf(context).height * 0.85;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppTheme.radiusSheet)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. Standard drag handle
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colorScheme.outlineVariant.withValues(alpha: 0.8),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // 2. Scrollable content area (prevents RenderFlex overflow on large font scaling)
              Flexible(
                child: SingleChildScrollView(
                  physics: const ClampingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Photo Gallery Carousel / Placeholder Hero
                      ParkingPhotoGallery(
                        parkingId: loc.id,
                        facilityName: displayName,
                      ),
                      const SizedBox(height: 14),

                      // Header Row with Title and Close button
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  displayName,
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.4,
                                    color: colorScheme.onSurface,
                                    height: 1.2,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (widget.distanceMeters != null) ...[
                                  const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.near_me_outlined,
                                        size: 15,
                                        color: colorScheme.primary,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${_formatDistance(widget.distanceMeters!)} away (straight-line)',
                                        style: theme.textTheme.labelMedium?.copyWith(
                                          color: colorScheme.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filledTonal(
                            icon: Icon(
                              isSaved ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
                              size: 20,
                              color: isSaved ? colorScheme.primary : colorScheme.onSurfaceVariant,
                            ),
                            tooltip: isSaved ? 'Remove from saved' : 'Save parking',
                            style: IconButton.styleFrom(
                              minimumSize: const Size(36, 36),
                              padding: EdgeInsets.zero,
                            ),
                            onPressed: () {
                              AppHaptics.lightImpact();
                              ref.read(savedParkingRefsProvider.notifier).toggleSave(loc);
                              if (ref.read(authProvider).isGuest && !isSaved) {
                                AuthPromptBottomSheet.show(context, facilityName: loc.name);
                              }
                            },
                          ),
                          const SizedBox(width: 8),
                          IconButton.filledTonal(
                            icon: const Icon(Icons.close_rounded, size: 20),
                            onPressed: widget.onClose,
                            tooltip: 'Close details',
                            style: IconButton.styleFrom(
                              minimumSize: const Size(36, 36),
                              padding: EdgeInsets.zero,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 14),

                      // Address Card
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 2.0),
                              child: Icon(
                                Icons.place_outlined,
                                size: 18,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                displayAddress,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 12),

                      // Verified Facility Attributes (Pricing, Hours, Access)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                        ),
                        child: Column(
                          children: [
                            // Pricing Info Row
                            _DetailInfoRow(
                              icon: Icons.payments_outlined,
                              label: 'Pricing',
                              value: _buildPricingLabel(loc),
                              valueColor: _buildPricingColor(loc, colorScheme),
                            ),
                            const Divider(height: 16),

                            // Operational Hours Row
                            _DetailInfoRow(
                              icon: Icons.access_time_rounded,
                              label: 'Opening Hours',
                              value: _buildOpeningLabel(loc),
                              valueColor: _buildOpeningColor(loc, colorScheme),
                            ),
                            const Divider(height: 16),

                            // Access Row
                            _DetailInfoRow(
                              icon: Icons.lock_open_rounded,
                              label: 'Access',
                              value: _buildAccessLabel(loc),
                              valueColor: colorScheme.onSurface,
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 12),

                      // Provider Attribution & Coordinates
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${loc.latitude.toStringAsFixed(4)}, ${loc.longitude.toStringAsFixed(4)}',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: colorScheme.outline,
                                fontSize: 11,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Source: Google Places',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.outline,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),

              // 3. Persistent Navigation Action
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  icon: _isLaunching
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: colorScheme.onPrimary,
                          ),
                        )
                      : const Icon(Icons.directions_rounded, size: 20),
                  label: const Text(
                    'Directions',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  onPressed: _isLaunching ? null : () => _handleDirections(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _buildPricingLabel(ParkingLocation loc) {
    if (loc.isConfirmedFree) {
      if (loc.parkingOptions.freeParkingLot == true) return 'Confirmed Free Lot';
      if (loc.parkingOptions.freeStreetParking == true) return 'Confirmed Free Street Parking';
      if (loc.parkingOptions.freeGarageParking == true) return 'Confirmed Free Garage';
      return 'Confirmed Free';
    }
    if (loc.isConfirmedPaid) {
      if (loc.parkingOptions.paidParkingLot == true) return 'Confirmed Paid Lot';
      if (loc.parkingOptions.paidStreetParking == true) return 'Confirmed Paid Street Parking';
      if (loc.parkingOptions.paidGarageParking == true) return 'Confirmed Paid Garage';
      return 'Confirmed Paid';
    }
    if (loc.pricingType == PricingType.mixed) {
      return 'Mixed (Free & Paid options available)';
    }
    return 'Pricing unlisted';
  }

  Color _buildPricingColor(ParkingLocation loc, ColorScheme colorScheme) {
    if (loc.isConfirmedFree) return Colors.green.shade800;
    if (loc.isConfirmedPaid) return colorScheme.primary;
    if (loc.pricingType == PricingType.mixed) return Colors.purple.shade800;
    return colorScheme.onSurfaceVariant;
  }

  String _buildOpeningLabel(ParkingLocation loc) {
    if (loc.isConfirmedOpen) return 'Open now';
    if (loc.isConfirmedClosed) return 'Currently closed';
    return 'Hours unlisted';
  }

  Color _buildOpeningColor(ParkingLocation loc, ColorScheme colorScheme) {
    if (loc.isConfirmedOpen) return Colors.teal.shade800;
    if (loc.isConfirmedClosed) return Colors.red.shade800;
    return colorScheme.onSurfaceVariant;
  }

  String _buildAccessLabel(ParkingLocation loc) {
    switch (loc.accessType) {
      case AccessType.public:
        return 'Public Access';
      case AccessType.customersOnly:
        return 'Customers Only';
      case AccessType.private:
        return 'Private Access';
      case AccessType.unknown:
        return 'Access unlisted';
    }
  }
}

class _DetailInfoRow extends StatelessWidget {
  const _DetailInfoRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Icon(icon, size: 16, color: colorScheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w500,
          ),
        ),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: valueColor,
              fontWeight: FontWeight.w600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
