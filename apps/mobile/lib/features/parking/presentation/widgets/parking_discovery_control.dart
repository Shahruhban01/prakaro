import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_segmented_control.dart';
import '../../domain/parking_verification.dart';
import '../parking_providers.dart';

class ParkingDiscoveryControl extends ConsumerWidget {
  const ParkingDiscoveryControl({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(parkingMapProvider);
    if (!state.discoverySettings.displayEnabled) return const SizedBox.shrink();
    final mode = state.effectiveDiscoveryMode;
    final description = !state.verificationAvailable
        ? 'Verification information unavailable'
        : mode == ParkingDiscoveryMode.recommended
        ? 'Ordered by verification and access'
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Semantics(
            container: true,
            explicitChildNodes: true,
            label: 'Parking discovery mode',
            child: PrakaroSegmentedControl<ParkingDiscoveryMode>(
              items: [
                const PrakaroSegmentItem(
                  value: ParkingDiscoveryMode.recommended,
                  label: 'Recommended',
                ),
                if (state.discoverySettings.filteringEnabled)
                  const PrakaroSegmentItem(
                    value: ParkingDiscoveryMode.verifiedOnly,
                    label: 'Verified Only',
                  ),
                const PrakaroSegmentItem(
                  value: ParkingDiscoveryMode.allCandidates,
                  label: 'All Candidates',
                ),
              ],
              selectedValue: mode,
              onChanged: ref.read(parkingMapProvider.notifier).setDiscoveryMode,
            ),
          ),
        ),
        if (description != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              description,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    );
  }
}
