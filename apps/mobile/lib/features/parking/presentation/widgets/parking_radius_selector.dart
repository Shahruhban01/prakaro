import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../parking_providers.dart';

/// Interactive search radius selector supporting 1 km (1000m), 3 km (3000m), and 5 km (5000m).
/// Uses Material 3 SegmentedButton for accessibility, clear selected states, and responsive layout.
class ParkingRadiusSelector extends ConsumerWidget {
  const ParkingRadiusSelector({
    super.key,
    this.isCompact = false,
  });

  /// If true, applies compact padding and font sizing suitable for floating overlay cards on maps.
  final bool isCompact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    final selectedRadius = state.radiusMeters;

    return SegmentedButton<int>(
      segments: const [
        ButtonSegment<int>(
          value: 1000,
          label: Text('1 km'),
          tooltip: 'Search within 1 km radius',
        ),
        ButtonSegment<int>(
          value: 3000,
          label: Text('3 km'),
          tooltip: 'Search within 3 km radius (default)',
        ),
        ButtonSegment<int>(
          value: 5000,
          label: Text('5 km'),
          tooltip: 'Search within 5 km radius',
        ),
      ],
      selected: {selectedRadius},
      emptySelectionAllowed: false,
      multiSelectionEnabled: false,
      showSelectedIcon: false,
      style: ButtonStyle(
        visualDensity: isCompact ? VisualDensity.compact : VisualDensity.comfortable,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        backgroundColor: WidgetStateProperty.resolveWith<Color>((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.primaryContainer;
          }
          return colorScheme.surface;
        }),
        foregroundColor: WidgetStateProperty.resolveWith<Color>((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.onPrimaryContainer;
          }
          return colorScheme.onSurfaceVariant;
        }),
        textStyle: WidgetStateProperty.resolveWith<TextStyle?>((states) {
          final isSelected = states.contains(WidgetState.selected);
          return (isCompact ? theme.textTheme.labelMedium : theme.textTheme.labelLarge)?.copyWith(
            fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
            letterSpacing: -0.2,
          );
        }),
        side: WidgetStateProperty.all(
          BorderSide(
            color: colorScheme.outlineVariant.withValues(alpha: 0.6),
            width: 1.0,
          ),
        ),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
          ),
        ),
        padding: WidgetStateProperty.all(
          EdgeInsets.symmetric(
            horizontal: isCompact ? 10 : 14,
            vertical: isCompact ? 4 : 8,
          ),
        ),
      ),
      onSelectionChanged: (newSelection) {
        if (newSelection.isNotEmpty) {
          notifier.setRadius(newSelection.first);
        }
      },
    );
  }
}
