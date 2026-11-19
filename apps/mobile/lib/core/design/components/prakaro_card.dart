import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

/// Custom, elegant card surface adhering strictly to the Prakaro mobility design system.
/// Replaces stock Flutter Card widget with refined 16px radius, subtle border (#E8EAED),
/// soft diffused shadow, and tactile touch feedback.
class PrakaroCard extends StatefulWidget {
  const PrakaroCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.backgroundColor,
    this.borderColor,
    this.borderRadius,
    this.hasShadow = true,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final Color? borderColor;
  final double? borderRadius;
  final bool hasShadow;

  @override
  State<PrakaroCard> createState() => _PrakaroCardState();
}

class _PrakaroCardState extends State<PrakaroCard> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final radius = widget.borderRadius ?? AppTheme.radiusCard;
    final defaultBg = widget.backgroundColor ??
        (isDark ? AppTheme.surfaceCardDark : AppTheme.surfaceCardLight);

    final defaultBorder = widget.borderColor ??
        (isDark ? AppTheme.borderDark : AppTheme.borderLight);

    final shadows = widget.hasShadow
        ? (isDark ? AppTheme.cardShadowDark : AppTheme.cardShadowLight)
        : null;

    Widget card = AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeOutCubic,
      padding: widget.padding ?? const EdgeInsets.all(AppTheme.space16),
      decoration: BoxDecoration(
        color: _isPressed
            ? (isDark ? const Color(0xFF222733) : const Color(0xFFF9FAFC))
            : defaultBg,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: defaultBorder, width: 1.0),
        boxShadow: _isPressed ? null : shadows,
      ),
      child: widget.child,
    );

    if (widget.onTap != null) {
      card = GestureDetector(
        onTapDown: (_) => setState(() => _isPressed = true),
        onTapUp: (_) => setState(() => _isPressed = false),
        onTapCancel: () => setState(() => _isPressed = false),
        onTap: () {
          AppHaptics.lightImpact();
          widget.onTap?.call();
        },
        behavior: HitTestBehavior.opaque,
        child: card,
      );
    }

    return card;
  }
}
