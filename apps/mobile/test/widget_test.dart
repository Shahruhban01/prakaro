import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/services/navigation_service.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/presentation/parking_list_screen.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/widgets/google_attribution.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_card.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_details_sheet.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_empty_state.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_loading_state.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_view_switcher.dart';

class MockNavigationService extends NavigationService {
  bool launched = false;
  double? lastLat;
  double? lastLng;
  String? lastLabel;

  @override
  Future<bool> openDirections({
    required double destinationLatitude,
    required double destinationLongitude,
    String? destinationLabel,
  }) async {
    launched = true;
    lastLat = destinationLatitude;
    lastLng = destinationLongitude;
    lastLabel = destinationLabel;
    return true;
  }
}

void main() {
  group('1. ParkingDetailsSheet widget', () {
    testWidgets(
      'displays facility information, distance, and triggers close callback',
      (WidgetTester tester) async {
        const testLocation = ParkingLocation(
          id: 'google:test_spot',
          name: 'Grand Central Parking',
          latitude: 34.0837,
          longitude: 74.7973,
          address: '45 Residency Road, Srinagar',
          source: 'google',
        );

        var closed = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ProviderScope(
                child: ParkingDetailsSheet(
                  location: testLocation,
                  distanceMeters: 450,
                  onClose: () {
                    closed = true;
                  },
                ),
              ),
            ),
          ),
        );

        expect(find.text('Grand Central Parking'), findsOneWidget);
        expect(find.text('45 Residency Road, Srinagar'), findsOneWidget);
        expect(find.text('450 m away'), findsOneWidget);
        expect(find.text('Directions'), findsOneWidget);

        await tester.tap(find.byIcon(Icons.close_rounded));
        await tester.pump();
        expect(closed, isTrue);
      },
    );
  });

  group('2. ParkingCard widget', () {
    testWidgets(
      'renders facility name, formatted straight-line distance, and triggers directions',
      (WidgetTester tester) async {
        const testLocation = ParkingLocation(
          id: 'google:card_spot',
          name: 'Downtown Safe Park',
          latitude: 12.9716,
          longitude: 77.5946,
          address: 'MG Road, Bengaluru',
          source: 'google',
        );

        final mockNav = MockNavigationService();
        var cardTapped = false;

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              navigationServiceProvider.overrideWithValue(mockNav),
            ],
            child: MaterialApp(
              home: Scaffold(
                body: ParkingCard(
                  location: testLocation,
                  distanceMeters: 620,
                  onTap: () => cardTapped = true,
                ),
              ),
            ),
          ),
        );

        expect(find.text('Downtown Safe Park'), findsOneWidget);
        expect(find.text('MG Road, Bengaluru'), findsOneWidget);
        expect(find.text('620 m (straight-line)'), findsOneWidget);
        expect(find.text('Directions'), findsOneWidget);

        // Tap card body
        await tester.tap(find.text('Downtown Safe Park'));
        await tester.pump();
        expect(cardTapped, isTrue);

        // Tap Directions button
        await tester.tap(find.text('Directions'));
        await tester.pump();
        expect(mockNav.launched, isTrue);
        expect(mockNav.lastLat, 12.9716);
        expect(mockNav.lastLng, 77.5946);
        expect(mockNav.lastLabel, 'Downtown Safe Park');
      },
    );

    testWidgets(
      'renders "Address unavailable" neutral fallback when address is empty or whitespace',
      (WidgetTester tester) async {
        const testLocation = ParkingLocation(
          id: 'google:card_no_addr',
          name: 'Riverside Lot',
          latitude: 12.9716,
          longitude: 77.5946,
          address: '   ',
          source: 'google',
        );

        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              home: Scaffold(
                body: ParkingCard(
                  location: testLocation,
                  distanceMeters: null,
                ),
              ),
            ),
          ),
        );

        expect(find.text('Riverside Lot'), findsOneWidget);
        expect(find.text('Address unavailable'), findsOneWidget);
        expect(find.text('Distance unavailable'), findsOneWidget);
      },
    );
  });

  group('3. ParkingViewSwitcher widget', () {
    testWidgets(
      'renders List and Map options and fires callback on tap',
      (WidgetTester tester) async {
        ParkingViewMode selectedMode = ParkingViewMode.list;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: StatefulBuilder(
                builder: (context, setState) {
                  return ParkingViewSwitcher(
                    currentMode: selectedMode,
                    onModeChanged: (mode) {
                      setState(() {
                        selectedMode = mode;
                      });
                    },
                  );
                },
              ),
            ),
          ),
        );

        expect(find.text('List'), findsOneWidget);
        expect(find.text('Map'), findsOneWidget);

        // Tap Map
        await tester.tap(find.text('Map'));
        await tester.pumpAndSettle();
        expect(selectedMode, ParkingViewMode.map);

        // Tap List
        await tester.tap(find.text('List'));
        await tester.pumpAndSettle();
        expect(selectedMode, ParkingViewMode.list);
      },
    );
  });

  group('4. ParkingEmptyState widget', () {
    testWidgets(
      'renders empty title, message, and invokes onRetry callback',
      (WidgetTester tester) async {
        var retried = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ParkingEmptyState(
                title: 'No parking found nearby',
                message: 'No spots available within 3 km.',
                onRetry: () => retried = true,
              ),
            ),
          ),
        );

        expect(find.text('No parking found nearby'), findsOneWidget);
        expect(find.text('No spots available within 3 km.'), findsOneWidget);
        expect(find.text('Refresh Search'), findsOneWidget);

        await tester.tap(find.text('Refresh Search'));
        await tester.pump();
        expect(retried, isTrue);
      },
    );
  });

  group('5. GoogleAttributionFooter widget', () {
    testWidgets(
      'renders compliant "Powered by Google Places" attribution label',
      (WidgetTester tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: GoogleAttributionFooter(),
            ),
          ),
        );

        expect(find.text('Powered by Google Places'), findsOneWidget);
      },
    );
  });

  group('6. ParkingLoadingState skeleton widget', () {
    testWidgets(
      'renders skeleton placeholder cards without exceptions',
      (WidgetTester tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: ParkingLoadingState(itemCount: 3),
            ),
          ),
        );

        expect(find.byType(Card), findsNWidgets(3));
      },
    );
  });

  group('7. ParkingListScreen states', () {
    testWidgets(
      'renders loaded list with Prakaro branding, cards, count, and Google attribution',
      (WidgetTester tester) async {
        const locations = [
          ParkingLocation(
            id: 'spot_1',
            name: 'Central Plaza Parking',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Plaza Way',
            source: 'google',
          ),
          ParkingLocation(
            id: 'spot_2',
            name: 'North Bay Parking',
            latitude: 34.09,
            longitude: 74.80,
            address: 'Bay Road',
            source: 'google',
          ),
        ];

        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.loaded,
          userLatitude: 34.0837,
          userLongitude: 74.7973,
          locations: locations,
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Prakaro'), findsOneWidget);
        expect(find.text('Parking near you'), findsOneWidget);
        expect(find.text('2 spots found'), findsOneWidget);
        expect(find.text('Central Plaza Parking'), findsOneWidget);
        expect(find.text('North Bay Parking'), findsOneWidget);
        expect(find.text('Powered by Google Places'), findsOneWidget);
      },
    );

    testWidgets(
      'renders empty state when status is empty',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.empty,
          userLatitude: 34.0837,
          userLongitude: 74.7973,
          locations: [],
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('No parking found nearby'), findsOneWidget);
        expect(find.text('Refresh Search'), findsOneWidget);
      },
    );

    testWidgets(
      'renders permission required view when location permission denied',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.locationPermissionRequired,
          errorMessage: 'Location permission denied by user',
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Location Permission Required'), findsOneWidget);
        expect(find.text('Grant Access'), findsOneWidget);
        expect(find.text('Open Settings'), findsOneWidget);
      },
    );

    testWidgets(
      'renders backend error view when backend is unavailable',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.backendUnavailable,
          errorMessage: 'Unable to connect to parking discovery service.',
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Discovery Service Unavailable'), findsOneWidget);
        expect(find.text('Try Again'), findsOneWidget);
      },
    );
  });
}
