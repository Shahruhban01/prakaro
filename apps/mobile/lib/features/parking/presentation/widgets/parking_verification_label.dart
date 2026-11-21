import 'package:flutter/material.dart';

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
    final title = available ? verification.label : 'Verification unavailable';
    final restricted = available && verification.isRestricted;
    final reasons = <String>{
      if (explain && (!available || verification.status == ParkingFacilityStatus.unconfirmed))
        'Parking information has not been independently verified.',
      if (explain && available && verification.reviewedAt != null)
        'Last reviewed ${MaterialLocalizations.of(context).formatMediumDate(verification.reviewedAt!.toLocal())}',
      if (available && explain)
        for (final reason in verification.reasonCodes)
          if (reasonMessages[reason] case final String message) message,
    };
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
