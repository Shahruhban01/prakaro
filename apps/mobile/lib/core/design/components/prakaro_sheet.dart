import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

/// Custom, elegant bottom sheet container adhering to the Prakaro mobility design system.
/// Replaces stock Material bottom-sheet styling with refined 24px top radius,
/// smooth drag handle, and comfortable spacing.
class PrakaroSheet extends StatelessWidget {
  const PrakaroSheet({
    super.key,
    required this.child,
    this.padding,
    this.showDragHandle = true,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final bool showDragHandle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final sheetBg = isDark ? AppTheme.surfaceCardDark : Colors.white;
    final handleColor = isDark ? const Color(0xFF384050) : const Color(0xFFD6DAE1);
    final borderColor = isDark ? AppTheme.borderDark : AppTheme.borderLight;

    return Container(
      decoration: BoxDecoration(
        color: sheetBg,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppTheme.radiusSheet),
        ),
        border: Border(
          top: BorderSide(color: borderColor, width: 1.0),
          left: BorderSide(color: borderColor, width: 1.0),
          right: BorderSide(color: borderColor, width: 1.0),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.40 : 0.12),
            blurRadius: 24,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDragHandle) ...[
            const SizedBox(height: 10.0),
            Center(
              child: Container(
                width: 36.0,
                height: 4.0,
                decoration: BoxDecoration(
                  color: handleColor,
                  borderRadius: BorderRadius.circular(2.0),
                ),
              ),
            ),
            const SizedBox(height: 6.0),
          ],
          Flexible(
            child: Padding(
              padding: padding ?? const EdgeInsets.all(AppTheme.space16),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
