import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// Welcome / Onboarding screen highlighting Prakaro capabilities.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),

              // Logo & App Name
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Icon(
                    Icons.local_parking_rounded,
                    size: 48,
                    color: colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(height: 24),

              Text(
                'Prakaro',
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.0,
                ),
              ),
              const SizedBox(height: 8),

              Text(
                'Smarter parking discovery for modern drivers.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 36),

              // Feature Highlights
              _buildFeatureRow(
                theme,
                icon: Icons.explore_rounded,
                title: 'Nearby & Destination Search',
                subtitle: 'Find parking near your current location or ahead of time at your destination.',
              ),
              const SizedBox(height: 20),

              _buildFeatureRow(
                theme,
                icon: Icons.verified_rounded,
                title: 'Verified Badges & Smart Filters',
                subtitle: 'Filter by free or paid parking, open now, and public accessibility.',
              ),
              const SizedBox(height: 20),

              _buildFeatureRow(
                theme,
                icon: Icons.cloud_sync_rounded,
                title: 'Cloud-Synced Favorites',
                subtitle: 'Save parking spots and sync your preferences securely across all your devices.',
              ),

              const Spacer(flex: 2),

              // Actions
              FilledButton(
                onPressed: () {
                  AppHaptics.selection();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
                  );
                },
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text('Get Started'),
              ),
              const SizedBox(height: 12),

              OutlinedButton(
                onPressed: () {
                  AppHaptics.selection();
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
                  );
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text('Sign In'),
              ),
              const SizedBox(height: 12),

              TextButton(
                onPressed: () {
                  AppHaptics.selection();
                  Navigator.of(context).pop();
                },
                child: Text(
                  'Continue as Guest',
                  style: TextStyle(color: colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFeatureRow(
    ThemeData theme, {
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: theme.colorScheme.primary, size: 24),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
