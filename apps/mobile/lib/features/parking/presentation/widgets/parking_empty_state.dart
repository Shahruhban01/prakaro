import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// Clean, informative empty state presented when no parking facilities are detected or match filters.
class ParkingEmptyState extends StatelessWidget {
  const ParkingEmptyState({
    super.key,
    this.title = 'No parking facilities found',
    this.message =
        'No parking facilities were found within your current search area. Try refreshing or searching from a different location.',
    this.onRetry,
    this.onClearFilters,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onClearFilters;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 36.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHigh.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Icon(
                onClearFilters != null
                    ? Icons.filter_alt_off_rounded
                    : Icons.local_parking_rounded,
                size: 32,
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.75),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: colorScheme.onSurface,
                letterSpacing: -0.2,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (onClearFilters != null) ...[
                  FilledButton.icon(
                    icon: const Icon(Icons.clear_all_rounded, size: 18),
                    label: const Text('Clear Filters'),
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                      ),
                    ),
                    onPressed: onClearFilters,
                  ),
                  if (onRetry != null) const SizedBox(width: 10),
                ],
                if (onRetry != null)
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('Refresh Search'),
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                      ),
                    ),
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
