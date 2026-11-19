import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

/// Custom, elegant top bar adhering strictly to the Prakaro mobility design system.
/// Replaces stock Flutter AppBar with refined branding, clean typography, and unobtrusive action controls.
class PrakaroHeader extends StatelessWidget {
  const PrakaroHeader({
    super.key,
    this.title = 'Prakaro',
    this.subtitle,
    this.actions,
    this.leading,
    this.showBrand = true,
  });

  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final Widget? leading;
  final bool showBrand;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      color: isDark ? AppTheme.canvasDark : Colors.white,
      child: SafeArea(
        bottom: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: 8.0),
            ] else if (showBrand) ...[
              // Clean mobility emblem
              Container(
                width: 30.0,
                height: 30.0,
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.28),
                      blurRadius: 6,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: const Text(
                  'P',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 16.0,
                    letterSpacing: -0.5,
                    height: 1.0,
                  ),
                ),
              ),
              const SizedBox(width: 10.0),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 18.0,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      height: 1.2,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2.0),
                    Text(
                      subtitle!,
                      style: TextStyle(
                        fontSize: 12.0,
                        fontWeight: FontWeight.w400,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            ...?actions,
          ],
        ),
      ),
    );
  }
}
