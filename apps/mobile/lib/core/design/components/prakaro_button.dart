import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';

enum PrakaroButtonVariant {
  primary,
  tonal,
  outline,
  ghost,
  danger,
}

enum PrakaroButtonSize {
  small,
  medium,
  large,
}

/// Custom, accessible tactile button component adhering to the Prakaro mobility design system.
/// Replaces stock Flutter ElevatedButton, FilledButton, OutlinedButton, and TextButton.
class PrakaroButton extends StatefulWidget {
  const PrakaroButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = PrakaroButtonVariant.primary,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  });

  const PrakaroButton.primary({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  }) : variant = PrakaroButtonVariant.primary;

  const PrakaroButton.tonal({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  }) : variant = PrakaroButtonVariant.tonal;

  const PrakaroButton.outline({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  }) : variant = PrakaroButtonVariant.outline;

  const PrakaroButton.ghost({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  }) : variant = PrakaroButtonVariant.ghost;

  const PrakaroButton.danger({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = PrakaroButtonSize.medium,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  }) : variant = PrakaroButtonVariant.danger;

  final String label;
  final VoidCallback? onPressed;
  final PrakaroButtonVariant variant;
  final PrakaroButtonSize size;
  final PrakaroIconData? icon;
  final bool isLoading;
  final bool isFullWidth;

  @override
  State<PrakaroButton> createState() => _PrakaroButtonState();
}

class _PrakaroButtonState extends State<PrakaroButton> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isEnabled = widget.onPressed != null && !widget.isLoading;

    // Compute dimensions based on size
    final double height;
    final double horizontalPadding;
    final double fontSize;
    final double iconSize;

    switch (widget.size) {
      case PrakaroButtonSize.small:
        height = 34.0;
        horizontalPadding = 12.0;
        fontSize = 12.5;
        iconSize = 14.0;
        break;
      case PrakaroButtonSize.medium:
        height = 42.0;
        horizontalPadding = 16.0;
        fontSize = 13.5;
        iconSize = 16.0;
        break;
      case PrakaroButtonSize.large:
        height = 48.0;
        horizontalPadding = 20.0;
        fontSize = 15.0;
        iconSize = 18.0;
        break;
    }

    // Determine colors
    Color backgroundColor;
    Color foregroundColor;
    Border? border;

    switch (widget.variant) {
      case PrakaroButtonVariant.primary:
        backgroundColor = isEnabled
            ? (_isPressed ? AppTheme.primaryBlueHover : AppTheme.primaryBlue)
            : (isDark ? const Color(0xFF232834) : const Color(0xFFE0E4EA));
        foregroundColor = isEnabled
            ? Colors.white
            : (isDark ? const Color(0xFF6B7280) : const Color(0xFF9AA0A6));
        border = null;
        break;

      case PrakaroButtonVariant.tonal:
        backgroundColor = isEnabled
            ? (isDark
                ? (_isPressed ? const Color(0xFF1E2D4A) : AppTheme.accentSoftDark)
                : (_isPressed ? const Color(0xFFDFEAFD) : AppTheme.accentSoftLight))
            : (isDark ? const Color(0xFF1A1D24) : const Color(0xFFF1F3F6));
        foregroundColor = isEnabled
            ? (isDark ? const Color(0xFF90B5FF) : AppTheme.primaryBlue)
            : (isDark ? const Color(0xFF6B7280) : const Color(0xFF9AA0A6));
        border = null;
        break;

      case PrakaroButtonVariant.outline:
        backgroundColor = _isPressed
            ? (isDark ? const Color(0xFF1F2430) : const Color(0xFFF5F7FA))
            : Colors.transparent;
        foregroundColor = isEnabled
            ? (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight)
            : (isDark ? const Color(0xFF6B7280) : const Color(0xFF9AA0A6));
        border = Border.all(
          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
          width: 1.0,
        );
        break;

      case PrakaroButtonVariant.ghost:
        backgroundColor = _isPressed
            ? (isDark ? const Color(0xFF1F2430) : const Color(0xFFF0F3F7))
            : Colors.transparent;
        foregroundColor = isEnabled
            ? (isDark ? const Color(0xFF90B5FF) : AppTheme.primaryBlue)
            : (isDark ? const Color(0xFF6B7280) : const Color(0xFF9AA0A6));
        border = null;
        break;

      case PrakaroButtonVariant.danger:
        backgroundColor = isEnabled
            ? (_isPressed ? const Color(0xFFB42318) : AppTheme.errorRed)
            : (isDark ? const Color(0xFF2B1515) : const Color(0xFFFEECEB));
        foregroundColor = Colors.white;
        border = null;
        break;
    }

    Widget content = Row(
      mainAxisSize: widget.isFullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (widget.isLoading) ...[
          SizedBox(
            width: iconSize,
            height: iconSize,
            child: CircularProgressIndicator(
              strokeWidth: 2.0,
              color: foregroundColor,
            ),
          ),
          const SizedBox(width: 8),
        ] else if (widget.icon != null) ...[
          PrakaroIcon(
            widget.icon!,
            size: iconSize,
            color: foregroundColor,
          ),
          const SizedBox(width: 7),
        ],
        Text(
          widget.label,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.1,
            color: foregroundColor,
            height: 1.0,
          ),
        ),
      ],
    );

    Widget button = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOutCubic,
      height: height,
      padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: border,
        boxShadow: (widget.variant == PrakaroButtonVariant.primary && isEnabled && !_isPressed)
            ? [
                BoxShadow(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.22),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      alignment: Alignment.center,
      child: content,
    );

    return Semantics(
      button: true,
      enabled: isEnabled,
      label: widget.label,
      child: GestureDetector(
        onTapDown: isEnabled ? (_) => setState(() => _isPressed = true) : null,
        onTapUp: isEnabled ? (_) => setState(() => _isPressed = false) : null,
        onTapCancel: isEnabled ? () => setState(() => _isPressed = false) : null,
        onTap: isEnabled
            ? () {
                AppHaptics.lightImpact();
                widget.onPressed?.call();
              }
            : null,
        behavior: HitTestBehavior.opaque,
        child: widget.isFullWidth ? SizedBox(width: double.infinity, child: button) : button,
      ),
    );
  }
}

/// Custom minimal icon button with accessible minimum touch target (44x44 dp).
class PrakaroIconButton extends StatefulWidget {
  const PrakaroIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.size = 38.0,
    this.iconSize = 18.0,
    this.color,
    this.backgroundColor,
    this.borderColor,
  });

  final PrakaroIconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final double size;
  final double iconSize;
  final Color? color;
  final Color? backgroundColor;
  final Color? borderColor;

  @override
  State<PrakaroIconButton> createState() => _PrakaroIconButtonState();
}

class _PrakaroIconButtonState extends State<PrakaroIconButton> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isEnabled = widget.onPressed != null;

    final defaultBg = widget.backgroundColor ??
        (_isPressed
            ? (isDark ? const Color(0xFF242936) : const Color(0xFFF1F3F6))
            : Colors.transparent);

    final defaultFg = widget.color ??
        (isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight);

    Widget btn = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        color: defaultBg,
        shape: BoxShape.circle,
        border: widget.borderColor != null
            ? Border.all(color: widget.borderColor!, width: 1.0)
            : null,
      ),
      alignment: Alignment.center,
      child: PrakaroIcon(
        widget.icon,
        size: widget.iconSize,
        color: isEnabled ? defaultFg : defaultFg.withValues(alpha: 0.4),
        semanticLabel: widget.tooltip,
      ),
    );

    if (widget.tooltip != null) {
      btn = Tooltip(
        message: widget.tooltip!,
        child: btn,
      );
    }

    return GestureDetector(
      onTapDown: isEnabled ? (_) => setState(() => _isPressed = true) : null,
      onTapUp: isEnabled ? (_) => setState(() => _isPressed = false) : null,
      onTapCancel: isEnabled ? () => setState(() => _isPressed = false) : null,
      onTap: isEnabled
          ? () {
              AppHaptics.selection();
              widget.onPressed?.call();
            }
          : null,
      behavior: HitTestBehavior.opaque,
      child: btn,
    );
  }
}
