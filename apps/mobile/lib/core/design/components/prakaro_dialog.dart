import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';
import 'prakaro_button.dart';

/// Custom, elegant confirmation dialog adhering to the Prakaro mobility design system.
/// Replaces stock Flutter AlertDialog.
class PrakaroDialog extends StatelessWidget {
  const PrakaroDialog({
    super.key,
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.onConfirm,
    this.cancelLabel = 'Cancel',
    this.onCancel,
    this.isDanger = false,
    this.icon,
  });

  final String title;
  final String message;
  final String confirmLabel;
  final VoidCallback onConfirm;
  final String cancelLabel;
  final VoidCallback? onCancel;
  final bool isDanger;
  final PrakaroIconData? icon;

  static Future<bool?> show({
    required BuildContext context,
    required String title,
    required String message,
    required String confirmLabel,
    String cancelLabel = 'Cancel',
    bool isDanger = false,
    PrakaroIconData? icon,
  }) {
    AppHaptics.lightImpact();
    return showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.45),
      builder: (ctx) => PrakaroDialog(
        title: title,
        message: message,
        confirmLabel: confirmLabel,
        cancelLabel: cancelLabel,
        isDanger: isDanger,
        icon: icon,
        onConfirm: () => Navigator.of(ctx).pop(true),
        onCancel: () => Navigator.of(ctx).pop(false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final dialogBg = isDark ? AppTheme.surfaceCardDark : Colors.white;
    final borderColor = isDark ? AppTheme.borderDark : AppTheme.borderLight;

    return Center(
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: 320.0,
          margin: const EdgeInsets.symmetric(horizontal: 24.0),
          padding: const EdgeInsets.all(AppTheme.space24),
          decoration: BoxDecoration(
            color: dialogBg,
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(color: borderColor, width: 1.0),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.45 : 0.14),
                blurRadius: 28,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (icon != null) ...[
                Container(
                  width: 40.0,
                  height: 40.0,
                  decoration: BoxDecoration(
                    color: isDanger
                        ? (isDark ? AppTheme.errorSoftDark : AppTheme.errorSoftLight)
                        : (isDark ? AppTheme.accentSoftDark : AppTheme.accentSoftLight),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: PrakaroIcon(
                    icon!,
                    size: 20.0,
                    color: isDanger ? AppTheme.errorRed : AppTheme.primaryBlue,
                  ),
                ),
                const SizedBox(height: 16.0),
              ],
              Text(
                title,
                style: TextStyle(
                  fontSize: 17.0,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
              ),
              const SizedBox(height: 8.0),
              Text(
                message,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w400,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 22.0),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  PrakaroButton.ghost(
                    label: cancelLabel,
                    size: PrakaroButtonSize.small,
                    onPressed: () {
                      AppHaptics.lightImpact();
                      onCancel?.call();
                    },
                  ),
                  const SizedBox(width: 8.0),
                  PrakaroButton(
                    label: confirmLabel,
                    variant: isDanger ? PrakaroButtonVariant.danger : PrakaroButtonVariant.primary,
                    size: PrakaroButtonSize.small,
                    onPressed: () {
                      AppHaptics.lightImpact();
                      onConfirm();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
