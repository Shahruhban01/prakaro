import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/design/components/prakaro_card.dart';
import 'package:prakaro/core/design/components/prakaro_filter_chip.dart';
import 'package:prakaro/core/services/navigation_service.dart';
import 'package:prakaro/core/theme/app_theme.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/presentation/parking_list_screen.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/parking_photos_provider.dart';
import 'package:prakaro/features/parking/presentation/widgets/google_attribution.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_card.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_details_sheet.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_empty_state.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_loading_state.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_radius_selector.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_view_switcher.dart';

class MockNavigationService extends NavigationService {
  int launchCount = 0;
  double? lastLat;
  double? lastLng;
  String? lastLabel;

  @override
  Future<bool> openDirections({
    required double destinationLatitude,
    required double destinationLongitude,
    String? destinationLabel,
  }) async {
    launchCount++;
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
                overrides: [
                  parkingPhotosProvider.overrideWith((ref, id) async => const []),
                ],
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
        expect(find.text('450 m away (straight-line)'), findsOneWidget);
        expect(find.text('Directions'), findsOneWidget);

        await tester.tap(find.byTooltip('Close details'));
        await tester.pump();
        expect(closed, isTrue);
      },
    );

    testWidgets(
      'handles text scaling gracefully without RenderFlex overflow',
      (WidgetTester tester) async {
        const testLocation = ParkingLocation(
          id: 'google:long_text',
          name:
              'A Very Long Parking Facility Name That Extends Over Multiple Lines In Narrow Viewports',
          latitude: 34.0837,
          longitude: 74.7973,
          address:
              'Building 4A, Tech Industrial Boulevard, Near Sector 6 Metro Station, Srinagar, Jammu & Kashmir',
          source: 'google',
        );

        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(
                textScaler: TextScaler.linear(1.5),
                size: Size(360, 640),
              ),
              child: Scaffold(
                body: ProviderScope(
                  overrides: [
                    parkingPhotosProvider.overrideWith((ref, id) async => const []),
                  ],
                  child: ParkingDetailsSheet(
                    location: testLocation,
                    distanceMeters: 1420,
                    onClose: () {},
                  ),
                ),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
        expect(find.text('Directions'), findsOneWidget);
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
        expect(mockNav.launchCount, 1);
        expect(mockNav.lastLat, 12.9716);
        expect(mockNav.lastLng, 77.5946);
        expect(mockNav.lastLabel, 'Downtown Safe Park');

        // Immediate second tap should be debounced
        await tester.tap(find.text('Directions'));
        await tester.pump();
        expect(mockNav.launchCount, 1);
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

    testWidgets(
      'handles long names and unusual Unicode characters without overflow',
      (WidgetTester tester) async {
        const testLocation = ParkingLocation(
          id: 'google:unicode_lot',
          name: '🅿️ Central Multi-Level Parking • 地下駐車場 • مواقف السيارات',
          latitude: 12.9716,
          longitude: 77.5946,
          address: 'International Plaza, Wing B',
          source: 'google',
        );

        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              home: Scaffold(
                body: ParkingCard(
                  location: testLocation,
                  distanceMeters: 2300,
                ),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
        expect(find.textContaining('Central Multi-Level'), findsOneWidget);
        expect(find.text('2.3 km (straight-line)'), findsOneWidget);
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
                title: 'No parking facilities found',
                message: 'No facilities detected within 3 km.',
                onRetry: () => retried = true,
              ),
            ),
          ),
        );

        expect(find.text('No parking facilities found'), findsOneWidget);
        expect(find.text('No facilities detected within 3 km.'), findsOneWidget);
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

        expect(find.byType(PrakaroCard), findsNWidgets(3));
      },
    );
  });

  group('7. ParkingListScreen states and responsive layouts', () {
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
        expect(find.text('2 parking facilities found'), findsOneWidget);
        expect(find.text('Central Plaza Parking'), findsOneWidget);
        expect(find.text('North Bay Parking'), findsOneWidget);
        await tester.drag(find.byType(CustomScrollView), const Offset(0, -300));
        await tester.pumpAndSettle();
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

        expect(find.text('No parking facilities found'), findsOneWidget);
        expect(find.text('Refresh Search'), findsOneWidget);
      },
    );

    testWidgets(
      'renders friendly permission required view when location access is needed',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.locationPermissionRequired,
          errorMessage: 'Allow location access to discover nearby parking.',
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Find parking near you'), findsOneWidget);
        expect(find.text('Allow Location Access'), findsOneWidget);
        expect(find.text('Open Device Settings'), findsOneWidget);
      },
    );

    testWidgets(
      'renders backend error view when backend is unavailable',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.backendUnavailable,
          errorMessage: 'Unable to connect to the parking discovery service.',
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Parking service unavailable'), findsOneWidget);
        expect(find.text('Retry Connection'), findsOneWidget);
      },
    );

    testWidgets(
      'renders cleanly on small-screen compact devices (320x480)',
      (WidgetTester tester) async {
        const locations = [
          ParkingLocation(
            id: 'spot_small',
            name: 'City Compact Parking',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Lane 1',
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
            child: MediaQuery(
              data: const MediaQueryData(size: Size(320, 480)),
              child: const MaterialApp(
                home: ParkingListScreen(),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
        expect(find.text('City Compact Parking'), findsOneWidget);
      },
    );

    testWidgets(
      'supports Dark theme rendering without errors',
      (WidgetTester tester) async {
        const locations = [
          ParkingLocation(
            id: 'spot_dark',
            name: 'Night Express Parking',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Dark Ave',
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
            child: MaterialApp(
              theme: AppTheme.darkTheme,
              themeMode: ThemeMode.dark,
              home: const ParkingListScreen(),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
        expect(find.text('Night Express Parking'), findsOneWidget);
      },
    );
  });

  group('8. ParkingFilterBar and Smart Filtering interaction', () {
    testWidgets('renders filter chips and updates filter state on tap', (WidgetTester tester) async {
      const locations = [
        ParkingLocation(
          id: 'spot_1',
          name: 'Free Park Lot',
          latitude: 34.08,
          longitude: 74.79,
          address: 'Main St',
          source: 'google',
          pricingType: PricingType.free,
          openingStatus: OpeningStatus.open,
        ),
        ParkingLocation(
          id: 'spot_2',
          name: 'Paid Tower',
          latitude: 34.085,
          longitude: 74.795,
          address: 'Commercial Way',
          source: 'google',
          pricingType: PricingType.paid,
          openingStatus: OpeningStatus.closed,
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

      // Verify all filter chips render
      expect(find.widgetWithText(PrakaroFilterChip, 'All'), findsOneWidget);
      expect(find.widgetWithText(PrakaroFilterChip, 'Free'), findsOneWidget);
      expect(find.widgetWithText(PrakaroFilterChip, 'Paid'), findsOneWidget);
      expect(find.widgetWithText(PrakaroFilterChip, 'Open now'), findsOneWidget);
      expect(find.widgetWithText(PrakaroFilterChip, 'Public access'), findsOneWidget);

      // Initially both cards appear
      expect(find.text('Free Park Lot'), findsOneWidget);
      expect(find.text('Paid Tower'), findsOneWidget);

      // Tap "Free" filter chip
      await tester.tap(find.widgetWithText(PrakaroFilterChip, 'Free'));
      await tester.pumpAndSettle();

      // Only free lot remains visible
      expect(find.text('Free Park Lot'), findsOneWidget);
      expect(find.text('Paid Tower'), findsNothing);
      expect(find.text('Clear (1)'), findsOneWidget);

      // Ensure Clear (1) is visible by scrolling the horizontal filter list, then tap
      await tester.ensureVisible(find.text('Clear (1)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear (1)'));
      await tester.pumpAndSettle();

      // Both cards re-appear
      expect(find.text('Free Park Lot'), findsOneWidget);
      expect(find.text('Paid Tower'), findsOneWidget);
    });

    testWidgets('renders filter-aware empty state with clear filters button', (WidgetTester tester) async {
      const locations = [
        ParkingLocation(
          id: 'spot_only_paid',
          name: 'Paid Lot Only',
          latitude: 34.08,
          longitude: 74.79,
          address: 'Paid St',
          source: 'google',
          pricingType: PricingType.paid,
        ),
      ];

      final container = ProviderContainer();
      container.read(parkingMapProvider.notifier).state = const ParkingMapState(
        status: ParkingMapStatus.loaded,
        userLatitude: 34.0837,
        userLongitude: 74.7973,
        locations: locations,
        pricingFilter: PricingFilter.free, // Active free filter
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: ParkingListScreen(),
          ),
        ),
      );

      expect(find.text('No confirmed free parking found'), findsOneWidget);
      expect(find.text('Clear Filters'), findsOneWidget);

      // Tap Clear Filters
      await tester.tap(find.text('Clear Filters'));
      await tester.pumpAndSettle();

      // Paid lot re-appears because filter was cleared back to All
      expect(find.text('Paid Lot Only'), findsOneWidget);
    });
  });

  group('9. Enriched ParkingCard badges', () {
    testWidgets('renders verified badges for free, open now, and price unlisted', (WidgetTester tester) async {
      const freeOpenLoc = ParkingLocation(
        id: 'loc_free_open',
        name: 'Eco Lot',
        latitude: 34.08,
        longitude: 74.79,
        address: 'Eco Lane',
        source: 'google',
        pricingType: PricingType.free,
        openingStatus: OpeningStatus.open,
      );

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: ParkingCard(
                location: freeOpenLoc,
                distanceMeters: 300,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Free parking'), findsOneWidget);
      expect(find.text('Open now'), findsOneWidget);
      expect(find.text('Eco Lot'), findsOneWidget);
    });

    testWidgets('renders price unlisted badge when metadata is unknown', (WidgetTester tester) async {
      const unknownLoc = ParkingLocation(
        id: 'loc_unknown',
        name: 'Mystery Lot',
        latitude: 34.08,
        longitude: 74.79,
        address: 'Unknown Road',
        source: 'google',
      );

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: ParkingCard(
                location: unknownLoc,
                distanceMeters: 500,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Price unlisted'), findsOneWidget);
    });
  });

  group('10. ParkingRadiusSelector & Milestone 07 discovery UX', () {
    testWidgets(
      'ParkingRadiusSelector renders 1 km, 3 km, 5 km segments and updates radius',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: Scaffold(
                body: ParkingRadiusSelector(),
              ),
            ),
          ),
        );

        expect(find.text('1 km'), findsOneWidget);
        expect(find.text('3 km'), findsOneWidget);
        expect(find.text('5 km'), findsOneWidget);

        // Default radius is 3000
        expect(container.read(parkingMapProvider).radiusMeters, 3000);

        // Tap 1 km
        await tester.tap(find.text('1 km'));
        await tester.pump();
        expect(container.read(parkingMapProvider).radiusMeters, 1000);

        // Tap 5 km
        await tester.tap(find.text('5 km'));
        await tester.pump();
        expect(container.read(parkingMapProvider).radiusMeters, 5000);

        // Allow debounce timer to settle before test finishes
        await tester.pumpAndSettle(const Duration(milliseconds: 400));
      },
    );

    testWidgets(
      'ParkingEmptyState renders Increase Radius action and invokes callback',
      (WidgetTester tester) async {
        var radiusIncreased = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ParkingEmptyState(
                title: 'No parking facilities found',
                message: 'Try increasing search radius.',
                onIncreaseRadius: () {
                  radiusIncreased = true;
                },
                increaseRadiusLabel: 'Increase to 5 km',
              ),
            ),
          ),
        );

        expect(find.text('Increase to 5 km'), findsOneWidget);
        await tester.tap(find.text('Increase to 5 km'));
        await tester.pump();
        expect(radiusIncreased, true);
      },
    );

    testWidgets(
      'ParkingListScreen shows Selected map area context and Near me action button',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.loaded,
          isCustomSearchArea: true,
          searchCenterLatitude: 34.1200,
          searchCenterLongitude: 74.8500,
          locations: [
            ParkingLocation(
              id: 'p_1',
              name: 'Dal Lake Parking',
              latitude: 34.1210,
              longitude: 74.8510,
              address: 'Boulevard Ghat 1',
              source: 'google',
            ),
          ],
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Selected map area'), findsOneWidget);
        expect(find.text('Near me'), findsOneWidget);
        expect(find.text('Dal Lake Parking'), findsOneWidget);
      },
    );

    testWidgets(
      'ParkingListScreen displays stale notice banner when isStaleResults is true',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.loaded,
          isStaleResults: true,
          staleNotice: 'Showing previous results. Refresh to try again.',
          locations: [
            ParkingLocation(
              id: 'p_stale',
              name: 'Cached View Facility',
              latitude: 34.08,
              longitude: 74.79,
              address: 'Residency Road',
              source: 'google',
            ),
          ],
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Showing previous results. Refresh to try again.'), findsOneWidget);
        expect(find.text('Refresh'), findsOneWidget);
        expect(find.text('Cached View Facility'), findsOneWidget);
      },
    );

    testWidgets(
      'ParkingListScreen displays friendly offline message when isOffline is true',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.backendUnavailable,
          isOffline: true,
          errorMessage: "You're offline. Connect to the internet to search for parking.",
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text("You're offline"), findsOneWidget);
        expect(find.text("You're offline. Connect to the internet to search for parking."), findsOneWidget);
      },
    );

    testWidgets(
      'ParkingListScreen displays friendly timeout message when isTimedOut is true',
      (WidgetTester tester) async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        container.read(parkingMapProvider.notifier).state = const ParkingMapState(
          status: ParkingMapStatus.backendUnavailable,
          isTimedOut: true,
          errorMessage: 'This search is taking longer than expected.',
        );

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(
              home: ParkingListScreen(),
            ),
          ),
        );

        expect(find.text('Search timed out'), findsOneWidget);
        expect(find.text('This search is taking longer than expected.'), findsOneWidget);
      },
    );
  });
}
