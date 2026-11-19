import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';

/// Custom, prominent destination search trigger adhering to the Prakaro mobility design system.
/// Replaces stock Flutter SearchBar, SearchAnchor, and generic text field styling.
class PrakaroSearchBarTrigger extends StatelessWidget {
  const PrakaroSearchBarTrigger({
    super.key,
    required this.onTap,
    this.destinationName,
    this.onClear,
    this.placeholder = 'Where would you like to park?',
  });

  final VoidCallback onTap;
  final String? destinationName;
  final VoidCallback? onClear;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final hasDestination = destinationName != null && destinationName!.isNotEmpty;

    final bgColor = isDark
        ? (hasDestination ? const Color(0xFF192233) : const Color(0xFF1A1D24))
        : (hasDestination ? AppTheme.accentSoftLight : const Color(0xFFF4F6F8));

    final borderColor = hasDestination
        ? AppTheme.primaryBlue.withValues(alpha: 0.40)
        : (isDark ? AppTheme.borderDark : AppTheme.borderLight);

    return GestureDetector(
      onTap: () {
        AppHaptics.selection();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 48.0,
        padding: const EdgeInsets.symmetric(horizontal: 14.0),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: borderColor, width: 1.0),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.20 : 0.03),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            PrakaroIcon(
              hasDestination ? PrakaroIconData.locationPin : PrakaroIconData.search,
              size: 19.0,
              color: hasDestination
                  ? AppTheme.primaryBlue
                  : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
            ),
            const SizedBox(width: 10.0),
            Expanded(
              child: Text(
                hasDestination ? destinationName! : placeholder,
                style: TextStyle(
                  fontSize: 14.0,
                  fontWeight: hasDestination ? FontWeight.w600 : FontWeight.w400,
                  letterSpacing: -0.1,
                  color: hasDestination
                      ? (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight)
                      : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (hasDestination && onClear != null)
              GestureDetector(
                onTap: () {
                  AppHaptics.selection();
                  onClear!();
                },
                behavior: HitTestBehavior.opaque,
                child: Container(
                  padding: const EdgeInsets.all(4.0),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF263044) : const Color(0xFFDFEAFD),
                    shape: BoxShape.circle,
                  ),
                  child: PrakaroIcon(
                    PrakaroIconData.close,
                    size: 12.0,
                    color: AppTheme.primaryBlue,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
