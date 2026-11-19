import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/auth_state.dart';
import '../providers/auth_providers.dart';
import '../../../parking/presentation/saved_providers.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// User profile and account settings screen.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  void _showSignOutDialog(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Sign Out'),
        content: const Text(
          'Are you sure you want to sign out? Your cloud-synced parking spots will remain safely stored in your account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              AppHaptics.selection();
              Navigator.of(ctx).pop();
              ref.read(authProvider.notifier).signOut();
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }

  void _showDeleteAccountDialog(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Theme.of(context).colorScheme.error),
            const SizedBox(width: 8),
            const Text('Delete Account'),
          ],
        ),
        content: const Text(
          'This action is irreversible. All your cloud-synced saved parking spots, search history, and account settings will be permanently erased.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () async {
              AppHaptics.selection();
              Navigator.of(ctx).pop();
              final success = await ref.read(authProvider.notifier).deleteAccount();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      success
                          ? 'Account deleted successfully.'
                          : 'Failed to delete account. Please try again.',
                    ),
                  ),
                );
              }
            },
            child: const Text('Delete Permanently'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final savedCount = ref.watch(savedParkingRefsProvider).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
        elevation: 0,
      ),
      body: authState.isGuest
          ? _buildGuestView(context, theme)
          : _buildAuthenticatedView(context, theme, ref, user!, authState, savedCount),
    );
  }

  Widget _buildGuestView(BuildContext context, ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.person_outline_rounded,
                size: 44,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Guest Mode',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You are exploring parking spots anonymously. Sign in or create an account to sync saved parking spots and search preferences across all your devices.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 32),

          FilledButton.icon(
            onPressed: () {
              AppHaptics.selection();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
              );
            },
            icon: const Icon(Icons.login_rounded),
            label: const Text('Sign In'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
          const SizedBox(height: 12),

          OutlinedButton.icon(
            onPressed: () {
              AppHaptics.selection();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
              );
            },
            icon: const Icon(Icons.person_add_rounded),
            label: const Text('Create Free Account'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAuthenticatedView(
    BuildContext context,
    ThemeData theme,
    WidgetRef ref,
    user,
    AuthState authState,
    int savedCount,
  ) {
    final initials = user.name.isNotEmpty
        ? user.name.trim().split(' ').map((e) => e.isNotEmpty ? e[0] : '').take(2).join()
        : 'P';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Profile card
          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Text(
                      initials.toUpperCase(),
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: theme.colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user.email,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.cloud_done_rounded,
                                size: 14,
                                color: theme.colorScheme.primary,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Cloud Sync Active',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Stats tile
          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: ListTile(
              leading: Icon(Icons.bookmark_rounded, color: theme.colorScheme.primary),
              title: const Text('Saved Parking Spots'),
              trailing: Text(
                '$savedCount',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Preferences section
          Text(
            'Preferences',
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),

          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Sync Recent Searches'),
                  subtitle: const Text(
                    'Save your recent search areas to your account for quick access across devices.',
                  ),
                  value: authState.preferences.recentSearchEnabled,
                  onChanged: (val) {
                    AppHaptics.selection();
                    ref.read(authProvider.notifier).updatePreferences(
                          recentSearchEnabled: val,
                        );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  title: const Text('Default Search Radius'),
                  subtitle: Text(
                    '${(authState.preferences.defaultRadiusMeters / 1000).toStringAsFixed(0)} km',
                  ),
                  trailing: SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 1000, label: Text('1 km')),
                      ButtonSegment(value: 3000, label: Text('3 km')),
                      ButtonSegment(value: 5000, label: Text('5 km')),
                    ],
                    selected: {authState.preferences.defaultRadiusMeters},
                    onSelectionChanged: (val) {
                      AppHaptics.selection();
                      ref.read(authProvider.notifier).updatePreferences(
                            defaultRadiusMeters: val.first,
                          );
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Account actions section
          Text(
            'Account Actions',
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),

          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.logout_rounded),
                  title: const Text('Sign Out'),
                  onTap: () {
                    AppHaptics.selection();
                    _showSignOutDialog(context, ref);
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: Icon(Icons.delete_forever_rounded, color: theme.colorScheme.error),
                  title: Text(
                    'Delete Account',
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                  onTap: () {
                    AppHaptics.selection();
                    _showDeleteAccountDialog(context, ref);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
