import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../screens/login_screen.dart';
import '../screens/register_screen.dart';

/// Bottom sheet displayed when a guest attempts an action requiring an account (e.g. saving a parking spot).
/// Preserves the user's ongoing discovery workflow and allows seamless dismissal.
class AuthPromptBottomSheet extends StatelessWidget {
  const AuthPromptBottomSheet({
    super.key,
    this.title = 'Sign in to save parking',
    this.message =
        'Create a free Prakaro account to save your favorite parking facilities and sync them across all your devices.',
    this.facilityName,
  });

  final String title;
  final String message;
  final String? facilityName;

  static Future<bool?> show(
    BuildContext context, {
    String? title,
    String? message,
    String? facilityName,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => AuthPromptBottomSheet(
        title: title ?? 'Sign in to save parking',
        message: message ??
            'Create a free Prakaro account to save your favorite parking facilities and sync them across all your devices.',
        facilityName: facilityName,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: theme.colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Icon badge
            Center(
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.bookmark_add_rounded,
                  color: theme.colorScheme.onPrimaryContainer,
                  size: 28,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),

            // Facility context chip if provided
            if (facilityName != null && facilityName!.isNotEmpty) ...[
              Center(
                child: Chip(
                  avatar: const Icon(Icons.local_parking_rounded, size: 16),
                  label: Text(
                    facilityName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                ),
              ),
              const SizedBox(height: 8),
            ],

            // Message
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),

            // Sign In Button
            FilledButton(
              onPressed: () {
                AppHaptics.selection();
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const LoginScreen(),
                  ),
                );
              },
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Sign In'),
            ),
            const SizedBox(height: 10),

            // Register / Create Account Button
            OutlinedButton(
              onPressed: () {
                AppHaptics.selection();
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const RegisterScreen(),
                  ),
                );
              },
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Create Account'),
            ),
            const SizedBox(height: 10),

            // Continue as Guest (Dismiss)
            TextButton(
              onPressed: () {
                AppHaptics.selection();
                Navigator.of(context).pop(false);
              },
              child: Text(
                'Continue as Guest',
                style: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
