import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Cohesive, bespoke icon definitions for the Prakaro mobility design system.
/// Replaces generic default Material icons with unified optical sizing,
/// consistent stroke geometry (1.8dp), rounded caps/joins, and clear active/inactive states.
enum PrakaroIconData {
  search,
  locationPin,
  directions,
  bookmarkOutline,
  bookmarkFilled,
  list,
  map,
  filter,
  close,
  user,
  parking,
  nearMe,
  check,
  clock,
  shield,
  moneyOff,
  payments,
  photo,
  refresh,
  chevronRight,
  moreVertical,
  trash,
  arrowBack,
  layers,
  car,
  sparkle,
  info,
}

/// Custom painted icon widget rendering scalable, pixel-perfect vector icons
/// adhering strictly to the Prakaro design system geometry.
class PrakaroIcon extends StatelessWidget {
  const PrakaroIcon(
    this.icon, {
    super.key,
    this.size = 20.0,
    this.color,
    this.semanticLabel,
  });

  final PrakaroIconData icon;
  final double size;
  final Color? color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? Theme.of(context).colorScheme.onSurface;

    final widget = SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _PrakaroIconPainter(icon, effectiveColor),
        size: Size(size, size),
      ),
    );

    if (semanticLabel != null && semanticLabel!.isNotEmpty) {
      return Semantics(
        label: semanticLabel,
        child: widget,
      );
    }

    return widget;
  }
}

class _PrakaroIconPainter extends CustomPainter {
  _PrakaroIconPainter(this.icon, this.color);

  final PrakaroIconData icon;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final strokePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = (size.width * 0.085).clamp(1.5, 2.2)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final fillPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final w = size.width;
    final h = size.height;

    switch (icon) {
      case PrakaroIconData.search:
        // Clean modern search glass
        final radius = w * 0.32;
        final center = Offset(w * 0.42, h * 0.42);
        canvas.drawCircle(center, radius, strokePaint);
        // Handle
        final handleStart = Offset(
          center.dx + radius * math.cos(math.pi / 4),
          center.dy + radius * math.sin(math.pi / 4),
        );
        final handleEnd = Offset(w * 0.88, h * 0.88);
        canvas.drawLine(handleStart, handleEnd, strokePaint);
        break;

      case PrakaroIconData.locationPin:
        // Modern teardrop map pin with subtle center hole
        final path = Path();
        path.moveTo(w * 0.5, h * 0.92);
        path.cubicTo(
          w * 0.15, h * 0.60,
          w * 0.15, h * 0.20,
          w * 0.5, h * 0.20,
        );
        path.cubicTo(
          w * 0.85, h * 0.20,
          w * 0.85, h * 0.60,
          w * 0.5, h * 0.92,
        );
        canvas.drawPath(path, strokePaint);
        canvas.drawCircle(Offset(w * 0.5, h * 0.42), w * 0.14, strokePaint);
        break;

      case PrakaroIconData.directions:
        // Turn-right navigation arrow
        final path = Path();
        path.moveTo(w * 0.25, h * 0.82);
        path.lineTo(w * 0.25, h * 0.50);
        path.cubicTo(
          w * 0.25, h * 0.30,
          w * 0.35, h * 0.22,
          w * 0.55, h * 0.22,
        );
        path.lineTo(w * 0.78, h * 0.22);
        canvas.drawPath(path, strokePaint);
        // Arrow head
        final arrow = Path();
        arrow.moveTo(w * 0.62, h * 0.08);
        arrow.lineTo(w * 0.82, h * 0.22);
        arrow.lineTo(w * 0.62, h * 0.36);
        canvas.drawPath(arrow, strokePaint);
        break;

      case PrakaroIconData.bookmarkOutline:
        // Elegant bookmark ribbon outline
        final path = Path();
        path.moveTo(w * 0.26, h * 0.15);
        path.lineTo(w * 0.74, h * 0.15);
        path.lineTo(w * 0.74, h * 0.86);
        path.lineTo(w * 0.50, h * 0.68);
        path.lineTo(w * 0.26, h * 0.86);
        path.close();
        canvas.drawPath(path, strokePaint);
        break;

      case PrakaroIconData.bookmarkFilled:
        // Elegant filled bookmark ribbon
        final path = Path();
        path.moveTo(w * 0.26, h * 0.15);
        path.lineTo(w * 0.74, h * 0.15);
        path.lineTo(w * 0.74, h * 0.86);
        path.lineTo(w * 0.50, h * 0.68);
        path.lineTo(w * 0.26, h * 0.86);
        path.close();
        canvas.drawPath(path, fillPaint);
        break;

      case PrakaroIconData.list:
        // Three horizontal lines with round end caps
        canvas.drawLine(Offset(w * 0.20, h * 0.30), Offset(w * 0.80, h * 0.30), strokePaint);
        canvas.drawLine(Offset(w * 0.20, h * 0.50), Offset(w * 0.80, h * 0.50), strokePaint);
        canvas.drawLine(Offset(w * 0.20, h * 0.70), Offset(w * 0.80, h * 0.70), strokePaint);
        break;

      case PrakaroIconData.map:
        // 3-panel folded map
        final path = Path();
        path.moveTo(w * 0.18, h * 0.28);
        path.lineTo(w * 0.40, h * 0.18);
        path.lineTo(w * 0.62, h * 0.28);
        path.lineTo(w * 0.82, h * 0.18);
        path.lineTo(w * 0.82, h * 0.74);
        path.lineTo(w * 0.62, h * 0.84);
        path.lineTo(w * 0.40, h * 0.74);
        path.lineTo(w * 0.18, h * 0.84);
        path.close();
        canvas.drawPath(path, strokePaint);
        canvas.drawLine(Offset(w * 0.40, h * 0.18), Offset(w * 0.40, h * 0.74), strokePaint);
        canvas.drawLine(Offset(w * 0.62, h * 0.28), Offset(w * 0.62, h * 0.84), strokePaint);
        break;

      case PrakaroIconData.filter:
        // Sliders filter icon
        // Top slider
        canvas.drawLine(Offset(w * 0.18, h * 0.34), Offset(w * 0.82, h * 0.34), strokePaint);
        canvas.drawCircle(Offset(w * 0.38, h * 0.34), w * 0.12, fillPaint);
        // Bottom slider
        canvas.drawLine(Offset(w * 0.18, h * 0.66), Offset(w * 0.82, h * 0.66), strokePaint);
        canvas.drawCircle(Offset(w * 0.64, h * 0.66), w * 0.12, fillPaint);
        break;

      case PrakaroIconData.close:
        // Crisp smooth 'X'
        canvas.drawLine(Offset(w * 0.26, h * 0.26), Offset(w * 0.74, h * 0.74), strokePaint);
        canvas.drawLine(Offset(w * 0.74, h * 0.26), Offset(w * 0.26, h * 0.74), strokePaint);
        break;

      case PrakaroIconData.user:
        // Head
        canvas.drawCircle(Offset(w * 0.5, h * 0.35), w * 0.20, strokePaint);
        // Torso arc
        final bodyPath = Path();
        bodyPath.moveTo(w * 0.20, h * 0.85);
        bodyPath.cubicTo(
          w * 0.20, h * 0.62,
          w * 0.80, h * 0.62,
          w * 0.80, h * 0.85,
        );
        canvas.drawPath(bodyPath, strokePaint);
        break;

      case PrakaroIconData.parking:
        // Rounded square badge with P
        final rrect = RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.10, h * 0.10, w * 0.80, h * 0.80),
          Radius.circular(w * 0.22),
        );
        canvas.drawRRect(rrect, strokePaint);
        // Letter P
        final pPath = Path();
        pPath.moveTo(w * 0.36, h * 0.72);
        pPath.lineTo(w * 0.36, h * 0.28);
        pPath.lineTo(w * 0.54, h * 0.28);
        pPath.cubicTo(
          w * 0.68, h * 0.28,
          w * 0.68, h * 0.50,
          w * 0.54, h * 0.50,
        );
        pPath.lineTo(w * 0.36, h * 0.50);
        canvas.drawPath(pPath, strokePaint);
        break;

      case PrakaroIconData.nearMe:
        // Crosshair / GPS target
        canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.30, strokePaint);
        canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.10, fillPaint);
        canvas.drawLine(Offset(w * 0.5, h * 0.08), Offset(w * 0.5, h * 0.20), strokePaint);
        canvas.drawLine(Offset(w * 0.5, h * 0.80), Offset(w * 0.5, h * 0.92), strokePaint);
        canvas.drawLine(Offset(w * 0.08, h * 0.5), Offset(w * 0.20, h * 0.5), strokePaint);
        canvas.drawLine(Offset(w * 0.80, h * 0.5), Offset(w * 0.92, h * 0.5), strokePaint);
        break;

      case PrakaroIconData.check:
        // Smooth checkmark
        final checkPath = Path();
        checkPath.moveTo(w * 0.22, h * 0.52);
        checkPath.lineTo(w * 0.42, h * 0.72);
        checkPath.lineTo(w * 0.78, h * 0.28);
        canvas.drawPath(checkPath, strokePaint);
        break;

      case PrakaroIconData.clock:
        // Minimal clock face
        canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.38, strokePaint);
        final hands = Path();
        hands.moveTo(w * 0.5, h * 0.24);
        hands.lineTo(w * 0.5, h * 0.5);
        hands.lineTo(w * 0.68, h * 0.5);
        canvas.drawPath(hands, strokePaint);
        break;

      case PrakaroIconData.shield:
        // Shield outline for public access
        final shield = Path();
        shield.moveTo(w * 0.5, h * 0.16);
        shield.lineTo(w * 0.80, h * 0.26);
        shield.cubicTo(
          w * 0.80, h * 0.64,
          w * 0.50, h * 0.86,
          w * 0.50, h * 0.86,
        );
        shield.cubicTo(
          w * 0.50, h * 0.86,
          w * 0.20, h * 0.64,
          w * 0.20, h * 0.26,
        );
        shield.close();
        canvas.drawPath(shield, strokePaint);
        break;

      case PrakaroIconData.moneyOff:
        // Dollar slash or clean tag for free
        canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.36, strokePaint);
        // S curve
        final sPath = Path();
        sPath.moveTo(w * 0.60, h * 0.36);
        sPath.cubicTo(w * 0.40, h * 0.34, w * 0.40, h * 0.48, w * 0.50, h * 0.50);
        sPath.cubicTo(w * 0.60, h * 0.52, w * 0.60, h * 0.66, w * 0.40, h * 0.64);
        canvas.drawPath(sPath, strokePaint);
        // Diagonal strike
        canvas.drawLine(Offset(w * 0.26, h * 0.74), Offset(w * 0.74, h * 0.26), strokePaint);
        break;

      case PrakaroIconData.payments:
        // Credit card / bank notes outline
        final card = RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.16, h * 0.26, w * 0.68, h * 0.48),
          Radius.circular(w * 0.12),
        );
        canvas.drawRRect(card, strokePaint);
        canvas.drawLine(Offset(w * 0.16, h * 0.40), Offset(w * 0.84, h * 0.40), strokePaint);
        canvas.drawCircle(Offset(w * 0.32, h * 0.56), w * 0.05, fillPaint);
        break;

      case PrakaroIconData.photo:
        // Camera / image frame
        final frame = RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.16, h * 0.20, w * 0.68, h * 0.60),
          Radius.circular(w * 0.12),
        );
        canvas.drawRRect(frame, strokePaint);
        canvas.drawCircle(Offset(w * 0.36, h * 0.38), w * 0.08, fillPaint);
        // Mountain triangle
        final mtn = Path();
        mtn.moveTo(w * 0.24, h * 0.70);
        mtn.lineTo(w * 0.46, h * 0.48);
        mtn.lineTo(w * 0.60, h * 0.60);
        mtn.lineTo(w * 0.68, h * 0.54);
        mtn.lineTo(w * 0.78, h * 0.70);
        canvas.drawPath(mtn, strokePaint);
        break;

      case PrakaroIconData.refresh:
        // Smooth rotating arrow
        final arcRect = Rect.fromCircle(center: Offset(w * 0.5, h * 0.5), radius: w * 0.32);
        canvas.drawArc(arcRect, -math.pi / 2, math.pi * 1.5, false, strokePaint);
        // Arrow cap
        final cap = Path();
        cap.moveTo(w * 0.50, h * 0.06);
        cap.lineTo(w * 0.62, h * 0.18);
        cap.lineTo(w * 0.50, h * 0.30);
        canvas.drawPath(cap, strokePaint);
        break;

      case PrakaroIconData.chevronRight:
        // Smooth chevron
        final chev = Path();
        chev.moveTo(w * 0.36, h * 0.24);
        chev.lineTo(w * 0.64, h * 0.50);
        chev.lineTo(w * 0.36, h * 0.76);
        canvas.drawPath(chev, strokePaint);
        break;

      case PrakaroIconData.moreVertical:
        // Three vertical dots
        canvas.drawCircle(Offset(w * 0.5, h * 0.25), w * 0.08, fillPaint);
        canvas.drawCircle(Offset(w * 0.5, h * 0.50), w * 0.08, fillPaint);
        canvas.drawCircle(Offset(w * 0.5, h * 0.75), w * 0.08, fillPaint);
        break;

      case PrakaroIconData.trash:
        // Clean trash can
        canvas.drawLine(Offset(w * 0.22, h * 0.30), Offset(w * 0.78, h * 0.30), strokePaint);
        canvas.drawLine(Offset(w * 0.38, h * 0.22), Offset(w * 0.62, h * 0.22), strokePaint);
        final bin = Path();
        bin.moveTo(w * 0.28, h * 0.30);
        bin.lineTo(w * 0.32, h * 0.82);
        bin.cubicTo(w * 0.32, h * 0.86, w * 0.68, h * 0.86, w * 0.68, h * 0.82);
        bin.lineTo(w * 0.72, h * 0.30);
        canvas.drawPath(bin, strokePaint);
        break;

      case PrakaroIconData.arrowBack:
        // Left navigation arrow
        canvas.drawLine(Offset(w * 0.22, h * 0.50), Offset(w * 0.78, h * 0.50), strokePaint);
        final arr = Path();
        arr.moveTo(w * 0.44, h * 0.28);
        arr.lineTo(w * 0.22, h * 0.50);
        arr.lineTo(w * 0.44, h * 0.72);
        canvas.drawPath(arr, strokePaint);
        break;

      case PrakaroIconData.layers:
        // Stacked view layers
        final p1 = Path();
        p1.moveTo(w * 0.5, h * 0.20);
        p1.lineTo(w * 0.82, h * 0.36);
        p1.lineTo(w * 0.5, h * 0.52);
        p1.lineTo(w * 0.18, h * 0.36);
        p1.close();
        canvas.drawPath(p1, strokePaint);
        final p2 = Path();
        p2.moveTo(w * 0.22, h * 0.54);
        p2.lineTo(w * 0.5, h * 0.68);
        p2.lineTo(w * 0.78, h * 0.54);
        canvas.drawPath(p2, strokePaint);
        break;

      case PrakaroIconData.car:
        // Minimal automobile front/side
        final car = Path();
        car.moveTo(w * 0.20, h * 0.66);
        car.lineTo(w * 0.24, h * 0.48);
        car.lineTo(w * 0.38, h * 0.34);
        car.lineTo(w * 0.62, h * 0.34);
        car.lineTo(w * 0.76, h * 0.48);
        car.lineTo(w * 0.80, h * 0.66);
        car.close();
        canvas.drawPath(car, strokePaint);
        // Wheels
        canvas.drawCircle(Offset(w * 0.32, h * 0.72), w * 0.09, strokePaint);
        canvas.drawCircle(Offset(w * 0.68, h * 0.72), w * 0.09, strokePaint);
        break;

      case PrakaroIconData.sparkle:
        // Star / feature
        final star = Path();
        star.moveTo(w * 0.5, h * 0.18);
        star.cubicTo(w * 0.5, h * 0.42, w * 0.58, h * 0.5, w * 0.82, h * 0.5);
        star.cubicTo(w * 0.58, h * 0.5, w * 0.5, h * 0.58, w * 0.5, h * 0.82);
        star.cubicTo(w * 0.5, h * 0.58, w * 0.42, h * 0.5, w * 0.18, h * 0.5);
        star.cubicTo(w * 0.42, h * 0.5, w * 0.5, h * 0.42, w * 0.5, h * 0.18);
        canvas.drawPath(star, fillPaint);
        break;

      case PrakaroIconData.info:
        canvas.drawCircle(Offset(w * 0.5, h * 0.5), w * 0.36, strokePaint);
        canvas.drawCircle(Offset(w * 0.5, h * 0.34), w * 0.05, fillPaint);
        canvas.drawLine(Offset(w * 0.5, h * 0.46), Offset(w * 0.5, h * 0.68), strokePaint);
        break;
    }
  }

  @override
  bool shouldRepaint(_PrakaroIconPainter oldDelegate) {
    return oldDelegate.icon != icon || oldDelegate.color != color;
  }
}
