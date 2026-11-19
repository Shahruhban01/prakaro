import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/components/prakaro_card.dart';
import '../../../../core/design/components/prakaro_dialog.dart';
import '../../../../core/design/components/prakaro_header.dart';
import '../../../../core/design/components/prakaro_segmented_control.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../parking/presentation/saved_providers.dart';
import '../../domain/auth_state.dart';
import '../providers/auth_providers.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// User profile and account settings screen.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _showSignOutDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await PrakaroDialog.show(
      context: context,
      title: 'Sign Out',
      message:
          'Are you sure you want to sign out? Your cloud-synced parking spots will remain safely stored in your account.',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Cancel',
      icon: PrakaroIconData.user,
    );

    if (confirmed == true) {
      ref.read(authProvider.notifier).signOut();
    }
  }

  Future<void> _showDeleteAccountDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await PrakaroDialog.show(
      context: context,
      title: 'Delete Account',
      message:
          'This action is irreversible. All your cloud-synced saved parking spots, search history, and account settings will be permanently erased.',
      confirmLabel: 'Delete Permanently',
      cancelLabel: 'Cancel',
      isDanger: true,
      icon: PrakaroIconData.trash,
    );

    if (confirmed == true && context.mounted) {
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
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final savedCount = ref.watch(savedParkingRefsProvider).length;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.canvasDark : Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            PrakaroHeader(
              title: 'Account',
              subtitle: 'Manage your profile and synchronization',
              leading: PrakaroIconButton(
                icon: PrakaroIconData.arrowBack,
                tooltip: 'Back',
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            Expanded(
              child: authState.isGuest
                  ? _buildGuestView(context, theme, isDark)
                  : _buildAuthenticatedView(
                      context, theme, isDark, ref, user!, authState, savedCount),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGuestView(BuildContext context, ThemeData theme, bool isDark) {
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
                color: isDark ? AppTheme.surfaceCardDark : AppTheme.accentSoftLight,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const PrakaroIcon(
                PrakaroIconData.user,
                size: 38,
                color: AppTheme.primaryBlue,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Guest Mode',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You are exploring parking spots anonymously. Sign in or create an account to sync saved parking spots and search preferences across all your devices.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              height: 1.45,
              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
            ),
          ),
          const SizedBox(height: 32),

          PrakaroButton.primary(
            label: 'Sign In',
            icon: PrakaroIconData.user,
            isFullWidth: true,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
              );
            },
          ),
          const SizedBox(height: 12),

          PrakaroButton.outline(
            label: 'Create Free Account',
            isFullWidth: true,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const RegisterScreen()),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAuthenticatedView(
    BuildContext context,
    ThemeData theme,
    bool isDark,
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
          PrakaroCard(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: isDark ? AppTheme.surfaceSecondaryDark : AppTheme.accentSoftLight,
                  child: Text(
                    initials.toUpperCase(),
                    style: const TextStyle(
                      color: AppTheme.primaryBlue,
                      fontWeight: FontWeight.bold,
                      fontSize: 20,
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
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user.email,
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF132E22) : const Color(0xFFEDF8F3),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const PrakaroIcon(
                              PrakaroIconData.check,
                              size: 13,
                              color: Color(0xFF27845B),
                            ),
                            const SizedBox(width: 4),
                            const Text(
                              'Cloud Sync Active',
                              style: TextStyle(
                                fontSize: 11,
                                color: Color(0xFF27845B),
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
          const SizedBox(height: 16),

          // Stats tile
          PrakaroCard(
            hasShadow: false,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                const PrakaroIcon(
                  PrakaroIconData.bookmarkFilled,
                  color: AppTheme.primaryBlue,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Saved Parking Spots',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                    ),
                  ),
                ),
                Text(
                  '$savedCount',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Preferences section
          Text(
            'Preferences',
            style: TextStyle(
              fontSize: 14,
              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),

          PrakaroCard(
            hasShadow: false,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Sync Recent Searches',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Save recent search areas to your account for quick access.',
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Switch.adaptive(
                      value: authState.preferences.recentSearchEnabled,
                      activeTrackColor: AppTheme.primaryBlue,
                      onChanged: (val) {
                        ref.read(authProvider.notifier).updatePreferences(
                              recentSearchEnabled: val,
                            );
                      },
                    ),
                  ],
                ),
                Divider(
                  height: 24,
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Default Radius',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${(authState.preferences.defaultRadiusMeters / 1000).toStringAsFixed(0)} km search distance',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: PrakaroSegmentedControl<int>(
                        items: const [
                          PrakaroSegmentItem(value: 1000, label: '1 km'),
                          PrakaroSegmentItem(value: 3000, label: '3 km'),
                          PrakaroSegmentItem(value: 5000, label: '5 km'),
                        ],
                        selectedValue: authState.preferences.defaultRadiusMeters,
                        onChanged: (val) {
                          ref.read(authProvider.notifier).updatePreferences(
                                defaultRadiusMeters: val,
                              );
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Account actions section
          Text(
            'Account Actions',
            style: TextStyle(
              fontSize: 14,
              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),

          PrakaroCard(
            hasShadow: false,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                InkWell(
                  onTap: () => _showSignOutDialog(context, ref),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      children: [
                        const PrakaroIcon(PrakaroIconData.user, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Sign Out',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Divider(
                  height: 1,
                  color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                ),
                InkWell(
                  onTap: () => _showDeleteAccountDialog(context, ref),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      children: [
                        const PrakaroIcon(
                          PrakaroIconData.trash,
                          size: 20,
                          color: Color(0xFFDC2626),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'Delete Account',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFDC2626),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
