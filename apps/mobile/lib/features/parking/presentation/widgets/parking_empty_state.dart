import 'package:flutter/material.dart';

import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/theme/app_theme.dart';

/// Clean, human-centered empty state presented when no parking facilities are detected or match filters.
/// Replaces stock Material buttons and default icons with bespoke Prakaro components.
class ParkingEmptyState extends StatelessWidget {
  const ParkingEmptyState({
    super.key,
    this.title = 'No parking places nearby',
    this.message =
        'No parking facilities were found within your current search area. Try increasing your radius or searching another location.',
    this.onRetry,
    this.onClearFilters,
    this.onIncreaseRadius,
    this.increaseRadiusLabel = 'Increase Radius',
    this.onResetSearchArea,
    this.customIcon,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onClearFilters;
  final VoidCallback? onIncreaseRadius;
  final String increaseRadiusLabel;
  final VoidCallback? onResetSearchArea;
  final PrakaroIconData? customIcon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final PrakaroIconData icon = customIcon ??
        (onClearFilters != null
            ? PrakaroIconData.filter
            : (onIncreaseRadius != null
                ? PrakaroIconData.nearMe
                : PrakaroIconData.parking));

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 32.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 56.0,
              height: 56.0,
              decoration: BoxDecoration(
                color: isDark ? AppTheme.accentSoftDark : AppTheme.accentSoftLight,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: PrakaroIcon(
                icon,
                size: 26.0,
                color: AppTheme.primaryBlue,
              ),
            ),
            const SizedBox(height: 16.0),
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
            const SizedBox(height: 8.0),
            Text(
              message,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w400,
                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                height: 1.42,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20.0),
            Wrap(
              spacing: 8.0,
              runSpacing: 8.0,
              alignment: WrapAlignment.center,
              children: [
                if (onClearFilters != null)
                  PrakaroButton.primary(
                    label: 'Clear Filters',
                    icon: PrakaroIconData.close,
                    size: PrakaroButtonSize.small,
                    onPressed: onClearFilters,
                  ),
                if (onIncreaseRadius != null)
                  PrakaroButton.tonal(
                    label: increaseRadiusLabel,
                    icon: PrakaroIconData.nearMe,
                    size: PrakaroButtonSize.small,
                    onPressed: onIncreaseRadius,
                  ),
                if (onResetSearchArea != null)
                  PrakaroButton.outline(
                    label: 'Near my location',
                    icon: PrakaroIconData.nearMe,
                    size: PrakaroButtonSize.small,
                    onPressed: onResetSearchArea,
                  ),
                if (onRetry != null)
                  PrakaroButton.tonal(
                    label: 'Refresh Search',
                    icon: PrakaroIconData.refresh,
                    size: PrakaroButtonSize.small,
                    onPressed: onRetry,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
