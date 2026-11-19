import 'package:flutter/material.dart';

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
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHigh.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SwitcherTab(
            label: 'List',
            icon: Icons.format_list_bulleted_rounded,
            isSelected: currentMode == ParkingViewMode.list,
            onTap: () => onModeChanged(ParkingViewMode.list),
          ),
          const SizedBox(width: 4),
          _SwitcherTab(
            label: 'Map',
            icon: Icons.map_outlined,
            isSelected: currentMode == ParkingViewMode.map,
            onTap: () => onModeChanged(ParkingViewMode.map),
          ),
        ],
      ),
    );
  }
}

class _SwitcherTab extends StatelessWidget {
  const _SwitcherTab({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? colorScheme.surfaceContainerLowest : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 16,
                color: isSelected ? colorScheme.primary : colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  color: isSelected ? colorScheme.onSurface : colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
