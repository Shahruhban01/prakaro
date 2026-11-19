import 'package:flutter/material.dart';

import '../../../../core/design/components/prakaro_segmented_control.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../parking_providers.dart';

/// Clean, modern segmented view switcher for toggling between List and Map presentations.
class ParkingViewSwitcher extends StatelessWidget {
  const ParkingViewSwitcher({
    super.key,
    required this.currentMode,
    required this.onModeChanged,
  });

  final ParkingViewMode currentMode;
  final ValueChanged<ParkingViewMode> onModeChanged;

  @override
  Widget build(BuildContext context) {
    return PrakaroSegmentedControl<ParkingViewMode>(
      isCompact: true,
      items: const [
        PrakaroSegmentItem(
          value: ParkingViewMode.list,
          label: 'List',
          icon: PrakaroIconData.list,
        ),
        PrakaroSegmentItem(
          value: ParkingViewMode.map,
          label: 'Map',
          icon: PrakaroIconData.map,
        ),
      ],
      selectedValue: currentMode,
      onChanged: onModeChanged,
    );
  }
}
