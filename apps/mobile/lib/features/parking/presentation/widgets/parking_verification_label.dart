import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/parking_verification.dart';

class ParkingVerificationLabel extends StatelessWidget {
  const ParkingVerificationLabel({
    super.key,
    required this.verification,
    this.unavailable = false,
    this.explain = false,
  });

  final ParkingVerification verification;
  final bool unavailable;
  final bool explain;

  @override
  Widget build(BuildContext context) {
    final available = !unavailable && !verification.isUnavailable;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isVerified = available && verification.status == ParkingFacilityStatus.verified;
    final title = available ? verification.label : 'Verification unavailable';
    final restricted = available && verification.isRestricted;

    final reasons = <String>{
      if (explain && (!available || verification.status == ParkingFacilityStatus.unconfirmed))
        'Parking information has not been independently verified.',
      if (explain && available && verification.reviewedAt != null)
        'Independently verified on ${MaterialLocalizations.of(context).formatMediumDate(verification.reviewedAt!.toLocal())}',
      if (available && explain)
        for (final reason in verification.reasonCodes)
          if (reasonMessages[reason] case final String message) message,
    };

    if (isVerified) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 6.0),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F291E) : const Color(0xFFECFDF5),
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(
            color: isDark ? const Color(0xFF059669) : const Color(0xFFA7F3D0),
            width: 1.0,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.verified_rounded,
                  size: 14.0,
                  color: isDark ? const Color(0xFF34D399) : const Color(0xFF059669),
                ),
                const SizedBox(width: 6.0),
                Text(
                  restricted ? '$title · Restricted access' : title,
                  style: TextStyle(
                    fontSize: 12.0,
                    fontWeight: FontWeight.w700,
                    color: isDark ? const Color(0xFF34D399) : const Color(0xFF065F46),
                    letterSpacing: -0.2,
                  ),
                ),
              ],
            ),
            if (explain && reasons.isNotEmpty) ...[
              const SizedBox(height: 4.0),
              for (final reason in reasons)
                Text(
                  reason,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w400,
                    color: isDark ? const Color(0xFFA7F3D0) : const Color(0xFF047857),
                    height: 1.3,
                  ),
                ),
            ],
          ],
        ),
      );
    }

    final style = Theme.of(context).textTheme.bodySmall;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(restricted ? '$title · Restricted access' : title, style: style),
        for (final reason in reasons)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(reason, style: style),
          ),
      ],
    );
  }

  static const reasonMessages = {
    'INDEPENDENT_CONFIRMATION':
        'Verified through independent facility information.',
    'SUPPORTING_OBSERVATIONS':
        'Available observations support a parking facility.',
    'INDEPENDENT_EXCLUSION':
        'Independent evidence disputes the parking listing.',
    'EVIDENCE_CONFLICT': 'Available evidence conflicts.',
    'EVIDENCE_INSUFFICIENT': 'Parking classification is uncertain.',
    'REVIEW_REQUIRED': 'More evidence is needed.',
    'REVIEW_STALE': 'Verification needs an updated review.',
    'ACCESS_UNCONFIRMED': 'Public access has not been confirmed.',
  };
}
