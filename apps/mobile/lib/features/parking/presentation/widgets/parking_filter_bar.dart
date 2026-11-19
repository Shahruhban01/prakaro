import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../parking_providers.dart';

/// Horizontally scrollable quick-filter bar for parking facilities.
class ParkingFilterBar extends ConsumerWidget {
  const ParkingFilterBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    final isAllSelected = !state.isAnyFilterActive;
    final isFreeSelected = state.pricingFilter == PricingFilter.free;
    final isPaidSelected = state.pricingFilter == PricingFilter.paid;
    final isOpenNowSelected = state.openNowFilter;
    final isPublicAccessSelected = state.publicAccessFilter;

    return SizedBox(
      height: 42,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        physics: const BouncingScrollPhysics(),
        children: [
          // 1. "All" Chip
          _FilterChipItem(
            label: 'All',
            isSelected: isAllSelected,
            onSelected: (_) {
              if (!isAllSelected) {
                notifier.clearFilters();
              }
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 2. "Free" Chip
          _FilterChipItem(
            label: 'Free',
            icon: Icons.money_off_rounded,
            isSelected: isFreeSelected,
            onSelected: (_) {
              notifier.setPricingFilter(
                isFreeSelected ? PricingFilter.all : PricingFilter.free,
              );
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 3. "Paid" Chip
          _FilterChipItem(
            label: 'Paid',
            icon: Icons.payments_outlined,
            isSelected: isPaidSelected,
            onSelected: (_) {
              notifier.setPricingFilter(
                isPaidSelected ? PricingFilter.all : PricingFilter.paid,
              );
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 4. "Open Now" Chip
          _FilterChipItem(
            label: 'Open now',
            icon: Icons.access_time_rounded,
            isSelected: isOpenNowSelected,
            onSelected: (_) => notifier.toggleOpenNow(),
          ),
          const SizedBox(width: AppTheme.space8),

          // 5. "Public Access" Chip
          _FilterChipItem(
            label: 'Public access',
            icon: Icons.lock_open_rounded,
            isSelected: isPublicAccessSelected,
            onSelected: (_) => notifier.togglePublicAccess(),
          ),

          // 6. "Clear filters" Action (visible when any non-default filter is active)
          if (state.isAnyFilterActive) ...[
            const SizedBox(width: AppTheme.space8),
            ActionChip(
              avatar: Icon(
                Icons.close_rounded,
                size: 14,
                color: colorScheme.onSurfaceVariant,
              ),
              label: Text(
                'Clear (${state.activeFilterCount})',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
              backgroundColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              side: BorderSide(
                color: colorScheme.outlineVariant.withValues(alpha: 0.5),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.radiusPill),
              ),
              onPressed: () => notifier.clearFilters(),
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterChipItem extends StatelessWidget {
  const _FilterChipItem({
    required this.label,
    required this.isSelected,
    required this.onSelected,
    this.icon,
  });

  final String label;
  final bool isSelected;
  final ValueChanged<bool> onSelected;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return FilterChip(
      showCheckmark: false,
      avatar: icon != null
          ? Icon(
              icon,
              size: 15,
              color: isSelected
                  ? colorScheme.onPrimary
                  : colorScheme.onSurfaceVariant,
            )
          : null,
      label: Text(
        label,
        style: theme.textTheme.labelMedium?.copyWith(
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          color: isSelected ? colorScheme.onPrimary : colorScheme.onSurface,
        ),
      ),
      selected: isSelected,
      onSelected: (val) {
        AppHaptics.selection();
        onSelected(val);
      },
      selectedColor: colorScheme.primary,
      backgroundColor: colorScheme.surface,
      surfaceTintColor: Colors.transparent,
      side: BorderSide(
        color: isSelected
            ? colorScheme.primary
            : colorScheme.outlineVariant.withValues(alpha: 0.8),
        width: isSelected ? 1.5 : 1.0,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 0.0),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}
