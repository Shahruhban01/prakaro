import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';

/// Reusable subtle skeleton placeholder component adhering to the Prakaro mobility design system.
/// Replaces stock CircularProgressIndicator with calm, non-distracting visual loading skeletons.
class PrakaroSkeleton extends StatefulWidget {
  const PrakaroSkeleton({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius,
  });

  final double width;
  final double height;
  final double? borderRadius;

  @override
  State<PrakaroSkeleton> createState() => _PrakaroSkeletonState();
}

class _PrakaroSkeletonState extends State<PrakaroSkeleton>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _animation = Tween<double>(begin: 0.35, end: 0.75).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseColor = isDark ? const Color(0xFF202530) : const Color(0xFFE9EDF2);

    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: baseColor.withValues(alpha: _animation.value),
            borderRadius: BorderRadius.circular(widget.borderRadius ?? AppTheme.radiusSmall),
          ),
        );
      },
    );
  }
}

/// Clean, minimal loading spinner adhering to the Prakaro mobility design system.
class PrakaroLoadingIndicator extends StatelessWidget {
  const PrakaroLoadingIndicator({
    super.key,
    this.size = 18.0,
    this.strokeWidth = 2.0,
    this.color,
  });

  final double size;
  final double strokeWidth;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: strokeWidth,
        color: color ?? AppTheme.primaryBlue,
      ),
    );
  }
}

