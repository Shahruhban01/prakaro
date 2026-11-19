import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_segmented_control.dart';
import '../parking_providers.dart';

/// Interactive search radius selector supporting 1 km (1000m), 3 km (3000m), and 5 km (5000m).
/// Uses custom smooth segmented control adhering to the Prakaro mobility design system.
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

    final selectedRadius = state.radiusMeters;

    return PrakaroSegmentedControl<int>(
      isCompact: isCompact,
      items: const [
        PrakaroSegmentItem(
          value: 1000,
          label: '1 km',
        ),
        PrakaroSegmentItem(
          value: 3000,
          label: '3 km',
        ),
        PrakaroSegmentItem(
          value: 5000,
          label: '5 km',
        ),
      ],
      selectedValue: selectedRadius,
      onChanged: (newRadius) {
        notifier.setRadius(newRadius);
      },
    );
  }
}
