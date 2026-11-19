import 'package:flutter/material.dart';

import '../../../../core/design/components/prakaro_card.dart';
import '../../../../core/theme/app_theme.dart';

/// Lightweight, calming skeleton placeholder rendered during initial parking discovery.
/// Replaces generic Material Card with PrakaroCard surfaces.
class ParkingLoadingState extends StatefulWidget {
  const ParkingLoadingState({super.key, this.itemCount = 3});

  final int itemCount;

  @override
  State<ParkingLoadingState> createState() => _ParkingLoadingStateState();
}

class _ParkingLoadingStateState extends State<ParkingLoadingState>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);

    _opacityAnimation = Tween<double>(begin: 0.35, end: 0.7).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.of(context).disableAnimations;

    Widget content = ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      itemCount: widget.itemCount,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, _) => const _SkeletonParkingCard(),
    );

    if (disableAnimations) {
      return Opacity(opacity: 0.5, child: content);
    }

    return AnimatedBuilder(
      animation: _opacityAnimation,
      builder: (context, child) {
        return Opacity(
          opacity: _opacityAnimation.value,
          child: child,
        );
      },
      child: content,
    );
  }
}

class _SkeletonParkingCard extends StatelessWidget {
  const _SkeletonParkingCard();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final placeholderColor = isDark ? const Color(0xFF252B38) : const Color(0xFFE9EDF2);

    return PrakaroCard(
      padding: const EdgeInsets.all(AppTheme.space16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: placeholderColor,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 16,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: placeholderColor,
                        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 12,
                      width: 160,
                      decoration: BoxDecoration(
                        color: placeholderColor,
                        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                height: 12,
                width: 80,
                decoration: BoxDecoration(
                  color: placeholderColor,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                ),
              ),
              Container(
                height: 32,
                width: 88,
                decoration: BoxDecoration(
                  color: placeholderColor,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
