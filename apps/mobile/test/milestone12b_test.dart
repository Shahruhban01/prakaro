import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/design/components/prakaro_segmented_control.dart';
import 'package:prakaro/core/errors/app_exception.dart';
import 'package:prakaro/features/parking/data/parking_remote_data_source.dart';
import 'package:prakaro/features/parking/data/parking_repository_impl.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/domain/parking_verification.dart';
import 'package:prakaro/features/parking/presentation/parking_list_screen.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_discovery_control.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_verification_label.dart';

import 'parking_test.dart' show MockApiClient;

class FixtureNotifier extends ParkingMapNotifier {
  FixtureNotifier(this.initial);

  final ParkingMapState initial;

  @override
  ParkingMapState build() => initial;
}

const settings = ParkingDiscoverySettings(
  displayEnabled: true,
  available: true,
  filteringEnabled: true,
  recommendedOrder: {'verified': 0, 'near': 1},
);

ParkingLocation location(String id, {ParkingVerification? verification}) =>
    ParkingLocation(
      id: id,
      name: id,
      latitude: id == 'near' ? 10.0 : 10.01,
      longitude: 20,
      address: 'Synthetic address',
      source: 'google',
      pricingType: PricingType.free,
      openingStatus: OpeningStatus.open,
      verification: verification,
    );

void main() {
  testWidgets(
    'custom discovery control exposes its semantic label and switches policy modes',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final container = ProviderContainer(
        overrides: [
          parkingMapProvider.overrideWith(
            () => FixtureNotifier(
              ParkingMapState(
                status: ParkingMapStatus.loaded,
                discoverySettings: settings,
                locations: [location('near')],
              ),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      try {
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: Scaffold(body: ParkingDiscoveryControl()),
            ),
          ),
        );
        expect(find.bySemanticsLabel('Parking discovery mode'), findsOneWidget);
      } finally {
        semantics.dispose();
      }
      expect(
        find.byType(PrakaroSegmentedControl<ParkingDiscoveryMode>),
        findsOneWidget,
      );
      expect(find.byType(SegmentedButton<ParkingDiscoveryMode>), findsNothing);
      await tester.tap(find.text('Verified Only'));
      await tester.pumpAndSettle();
      expect(container.read(parkingMapProvider).isVerifiedEmpty, isTrue);
      await tester.tap(find.text('All Candidates'));
      await tester.pumpAndSettle();
      expect(
        container.read(parkingMapProvider).filteredLocations.single.id,
        'near',
      );
    },
  );

  testWidgets('parking list explains the Verified Only empty state', (
    tester,
  ) async {
    final container = ProviderContainer(
      overrides: [
        parkingMapProvider.overrideWith(
          () => FixtureNotifier(
            ParkingMapState(
              status: ParkingMapStatus.loaded,
              discoveryMode: ParkingDiscoveryMode.verifiedOnly,
              discoverySettings: settings,
              locations: [location('near')],
            ),
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: ParkingListScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('No verified parking found'), findsOneWidget);
    expect(find.text('Show All Candidates'), findsOneWidget);
  });

  testWidgets(
    'renders independent verification, restricted access and unconfirmed detail truthfully',
    (tester) async {
      final verified = ParkingVerification(
        status: ParkingFacilityStatus.verified,
        access: 'PRIVATE',
        validUntil: DateTime.now().add(const Duration(days: 1)),
        reasonCodes: const ['INDEPENDENT_CONFIRMATION'],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                ParkingVerificationLabel(verification: verified, explain: true),
                const ParkingVerificationLabel(
                  verification: ParkingVerification(
                    status: ParkingFacilityStatus.unconfirmed,
                    reasonCodes: ['ACCESS_UNCONFIRMED'],
                  ),
                  explain: true,
                ),
                ParkingVerificationLabel(
                  verification: verified,
                  unavailable: true,
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.text('Verified parking · Restricted access'), findsOneWidget);
      expect(
        find.text('Verified through independent facility information.'),
        findsOneWidget,
      );
      expect(find.text('Unconfirmed parking'), findsOneWidget);
      expect(
        find.text('Public access has not been confirmed.'),
        findsOneWidget,
      );
      expect(find.text('Verification unavailable'), findsOneWidget);
    },
  );

  test(
    'mode and List/Map switching preserve the search and filters without extra requests',
    () async {
      var requests = 0;
      var offline = false;
      final expiry = DateTime.now()
          .toUtc()
          .add(const Duration(days: 1))
          .toIso8601String();
      final client = MockApiClient(
        handler: (path, query) async {
          requests++;
          expect(query?['mode'], 'ALL_CANDIDATES');
          if (offline) throw const OfflineException(message: 'Offline');
          return Response(
            requestOptions: RequestOptions(path: path),
            data: {
              'data': [
                {
                  'id': 'near',
                  'name': 'Near',
                  'latitude': 10.0,
                  'longitude': 20.0,
                  'pricingType': 'free',
                  'openingStatus': 'open',
                },
                {
                  'id': 'verified',
                  'name': 'Verified',
                  'latitude': 10.01,
                  'longitude': 20.0,
                  'openingStatus': 'open',
                  'verification': {
                    'facilityStatus': 'INDEPENDENTLY_VERIFIED',
                    'access': 'PUBLIC',
                    'pricing': 'FREE',
                    'validUntil': expiry,
                  },
                },
              ],
              'meta': {
                'intelligence': {
                  'available': true,
                  'filteringEnabled': true,
                  'defaultMode': 'ALL_CANDIDATES',
                  'recommendedOrder': ['verified', 'near'],
                },
              },
            },
          );
        },
      );
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            ParkingRepositoryImpl(ParkingRemoteDataSourceImpl(client)),
          ),
        ],
      );
      addTearDown(container.dispose);
      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 10, longitude: 20, radius: 1000);
      notifier.setDiscoveryMode(ParkingDiscoveryMode.recommended);
      expect(
        container.read(parkingMapProvider).filteredLocations.first.id,
        'verified',
      );
      notifier.setDiscoveryMode(ParkingDiscoveryMode.verifiedOnly);
      notifier.setViewMode(ParkingViewMode.map);
      final state = container.read(parkingMapProvider);
      expect(state.filteredLocations.single.id, 'verified');
      expect(state.radiusMeters, 1000);
      expect(state.searchCenterLatitude, 10);
      expect(state.viewMode, ParkingViewMode.map);
      expect(
        state.copyWith(pricingFilter: PricingFilter.paid).filteredLocations,
        isEmpty,
      );
      expect(
        state
            .copyWith(
              pricingFilter: PricingFilter.free,
              publicAccessFilter: true,
              openNowFilter: true,
            )
            .filteredLocations
            .single
            .id,
        'verified',
      );
      expect(requests, 1);
      offline = true;
      await notifier.refresh();
      final stale = container.read(parkingMapProvider);
      expect(stale.isStaleResults, isTrue);
      expect(stale.effectiveDiscoveryMode, ParkingDiscoveryMode.allCandidates);
      expect(stale.filteredLocations, hasLength(2));
      expect(requests, 2);
    },
  );
}
