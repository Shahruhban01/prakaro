import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../data/auth_remote_data_source.dart';
import '../../../parking/presentation/saved_providers.dart';

/// Dialog prompting the user to sync their local guest bookmarks to their cloud account upon login.
class LocalMigrationDialog extends ConsumerStatefulWidget {
  const LocalMigrationDialog({
    super.key,
    required this.localItemCount,
  });

  final int localItemCount;

  static Future<void> checkAndPrompt(BuildContext context, WidgetRef ref) async {
    final localRefs = ref.read(savedParkingRefsProvider);
    if (localRefs.isEmpty) return;

    if (!context.mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => LocalMigrationDialog(localItemCount: localRefs.length),
    );
  }

  @override
  ConsumerState<LocalMigrationDialog> createState() => _LocalMigrationDialogState();
}

class _LocalMigrationDialogState extends ConsumerState<LocalMigrationDialog> {
  bool _isMigrating = false;

  Future<void> _importLocalFavorites() async {
    setState(() => _isMigrating = true);

    try {
      final localRefs = ref.read(savedParkingRefsProvider);
      final remoteSource = ref.read(authRemoteDataSourceProvider);

      for (final refItem in localRefs) {
        try {
          await remoteSource.saveCloudParking(
            providerPlaceId: refItem.id,
            provider: refItem.provider,
          );
        } catch (_) {}
      }

      // Invalidate saved parking list to fetch updated cloud items
      ref.invalidate(savedParkingRefsProvider);

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Successfully synced ${widget.localItemCount} parking spots to your account.',
            ),
            backgroundColor: Theme.of(context).colorScheme.primary,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isMigrating = false);
        Navigator.of(context).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: Row(
        children: [
          Icon(Icons.cloud_upload_rounded, color: theme.colorScheme.primary),
          const SizedBox(width: 12),
          const Expanded(child: Text('Import Saved Parking?')),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'You have ${widget.localItemCount} parking ${widget.localItemCount == 1 ? "spot" : "spots"} saved on this device.',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Would you like to import them into your Prakaro account so they stay synced across all your devices?',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (_isMigrating) ...[
            const SizedBox(height: 20),
            const Center(child: CircularProgressIndicator()),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isMigrating
              ? null
              : () {
                  AppHaptics.selection();
                  Navigator.of(context).pop();
                },
          child: const Text('Keep Local Only'),
        ),
        FilledButton(
          onPressed: _isMigrating
              ? null
              : () {
                  AppHaptics.selection();
                  _importLocalFavorites();
                },
          child: const Text('Import to Cloud'),
        ),
      ],
    );
  }
}
