import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';

/// Custom, elegant filter chip adhering to the Prakaro mobility design system.
/// Replaces stock Flutter FilterChip, ChoiceChip, and ActionChip.
class PrakaroFilterChip extends StatelessWidget {
  const PrakaroFilterChip({
    super.key,
    required this.label,
    required this.isSelected,
    required this.onTap,
    this.icon,
    this.count,
    this.isAction = false,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  final PrakaroIconData? icon;
  final int? count;
  final bool isAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    Color backgroundColor;
    Color foregroundColor;
    Color borderColor;

    if (isSelected) {
      backgroundColor = AppTheme.primaryBlue;
      foregroundColor = Colors.white;
      borderColor = AppTheme.primaryBlue;
    } else if (isAction) {
      backgroundColor = isDark ? const Color(0xFF1E2430) : const Color(0xFFF1F3F6);
      foregroundColor = isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight;
      borderColor = isDark ? AppTheme.borderDark : AppTheme.borderLight;
    } else {
      backgroundColor = isDark ? AppTheme.surfaceSecondaryDark : AppTheme.surfaceSecondaryLight;
      foregroundColor = isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight;
      borderColor = isDark ? AppTheme.borderDark : AppTheme.borderLight;
    }

    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      child: GestureDetector(
        onTap: () {
          AppHaptics.selection();
          onTap();
        },
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOutCubic,
          height: 36.0,
          padding: const EdgeInsets.symmetric(horizontal: 12.0),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            border: Border.all(color: borderColor, width: 1.0),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.20),
                      blurRadius: 6,
                      offset: const Offset(0, 1.5),
                    ),
                  ]
                : null,
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (icon != null) ...[
                PrakaroIcon(
                  icon!,
                  size: 14.0,
                  color: foregroundColor,
                ),
                const SizedBox(width: 6.0),
              ],
              Text(
                count != null ? '$label ($count)' : label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  letterSpacing: -0.1,
                  color: foregroundColor,
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
