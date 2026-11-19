import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_filter_chip.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/theme/app_theme.dart';
import '../parking_providers.dart';

/// Horizontally scrollable quick-filter bar for parking facilities.
/// Uses custom PrakaroFilterChips adhering to the Prakaro mobility design system.
class ParkingFilterBar extends ConsumerWidget {
  const ParkingFilterBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    final notifier = ref.read(parkingMapProvider.notifier);

    final isAllSelected = !state.isAnyFilterActive;
    final isFreeSelected = state.pricingFilter == PricingFilter.free;
    final isPaidSelected = state.pricingFilter == PricingFilter.paid;
    final isOpenNowSelected = state.openNowFilter;
    final isPublicAccessSelected = state.publicAccessFilter;

    return SizedBox(
      height: 38.0,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        physics: const BouncingScrollPhysics(),
        children: [
          // 1. "All" Chip
          PrakaroFilterChip(
            label: 'All',
            isSelected: isAllSelected,
            onTap: () {
              if (!isAllSelected) {
                notifier.clearFilters();
              }
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 2. "Free" Chip
          PrakaroFilterChip(
            label: 'Free',
            icon: PrakaroIconData.moneyOff,
            isSelected: isFreeSelected,
            onTap: () {
              notifier.setPricingFilter(
                isFreeSelected ? PricingFilter.all : PricingFilter.free,
              );
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 3. "Paid" Chip
          PrakaroFilterChip(
            label: 'Paid',
            icon: PrakaroIconData.payments,
            isSelected: isPaidSelected,
            onTap: () {
              notifier.setPricingFilter(
                isPaidSelected ? PricingFilter.all : PricingFilter.paid,
              );
            },
          ),
          const SizedBox(width: AppTheme.space8),

          // 4. "Open now" Chip
          PrakaroFilterChip(
            label: 'Open now',
            icon: PrakaroIconData.clock,
            isSelected: isOpenNowSelected,
            onTap: () => notifier.toggleOpenNow(),
          ),
          const SizedBox(width: AppTheme.space8),

          // 5. "Public access" Chip
          PrakaroFilterChip(
            label: 'Public access',
            icon: PrakaroIconData.shield,
            isSelected: isPublicAccessSelected,
            onTap: () => notifier.togglePublicAccess(),
          ),

          // 6. "Clear filters" Action (visible when any non-default filter is active)
          if (state.isAnyFilterActive) ...[
            const SizedBox(width: AppTheme.space8),
            PrakaroFilterChip(
              label: 'Clear',
              count: state.activeFilterCount,
              icon: PrakaroIconData.close,
              isSelected: false,
              isAction: true,
              onTap: () => notifier.clearFilters(),
            ),
          ],
        ],
      ),
    );
  }
}
