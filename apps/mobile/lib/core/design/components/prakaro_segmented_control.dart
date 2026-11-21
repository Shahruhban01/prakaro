import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';

class PrakaroSegmentItem<T> {
  const PrakaroSegmentItem({
    required this.value,
    required this.label,
    this.icon,
  });

  final T value;
  final String label;
  final PrakaroIconData? icon;
}

/// Custom, elegant segmented control with smooth animated pill slider.
/// Replaces stock Flutter SegmentedButton.
class PrakaroSegmentedControl<T> extends StatelessWidget {
  const PrakaroSegmentedControl({
    super.key,
    required this.items,
    required this.selectedValue,
    required this.onChanged,
    this.isCompact = false,
  });

  final List<PrakaroSegmentItem<T>> items;
  final T selectedValue;
  final ValueChanged<T> onChanged;
  final bool isCompact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final containerBg = isDark
        ? const Color(0xFF1B1E26)
        : const Color(0xFFF1F3F6);

    final border = isDark
        ? AppTheme.borderDark
        : AppTheme.borderLight;

    return Container(
      padding: const EdgeInsets.all(3.0),
      decoration: BoxDecoration(
        color: containerBg,
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        border: Border.all(color: border, width: 1.0),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: items.map((item) {
          final isSelected = item.value == selectedValue;

          return _SegmentButton<T>(
            item: item,
            isSelected: isSelected,
            isCompact: isCompact,
            onTap: () {
              if (!isSelected) {
                AppHaptics.selection();
                onChanged(item.value);
              }
            },
          );
        }).toList(),
      ),
    );
  }
}

class _SegmentButton<T> extends StatelessWidget {
  const _SegmentButton({
    required this.item,
    required this.isSelected,
    required this.isCompact,
    required this.onTap,
  });

  final PrakaroSegmentItem<T> item;
  final bool isSelected;
  final bool isCompact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final selectedBg = isDark ? const Color(0xFF282E3B) : Colors.white;
    final selectedFg = isDark ? Colors.white : AppTheme.textPrimaryLight;
    final unselectedFg = isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight;

    return Semantics(
      button: true,
      selected: isSelected,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.symmetric(
            horizontal: isCompact ? 10.0 : 14.0,
            vertical: isCompact ? 5.0 : 7.0,
          ),
          decoration: BoxDecoration(
            color: isSelected ? selectedBg : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.06),
                      blurRadius: 4,
                      offset: const Offset(0, 1.5),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (item.icon != null) ...[
                PrakaroIcon(
                  item.icon!,
                  size: isCompact ? 13.0 : 15.0,
                  color: isSelected ? selectedFg : unselectedFg,
                ),
                const SizedBox(width: 5.0),
              ],
              Text(
                item.label,
                style: TextStyle(
                  fontSize: isCompact ? 12.0 : 13.0,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  letterSpacing: -0.1,
                  color: isSelected ? selectedFg : unselectedFg,
                  height: 1.0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
