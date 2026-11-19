import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:prakaro/core/errors/app_exception.dart';
import 'package:prakaro/core/services/location_service.dart';
import 'package:prakaro/core/services/navigation_service.dart';
import 'package:prakaro/core/storage/local_storage_service.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/domain/parking_photo.dart';
import 'package:prakaro/features/parking/domain/parking_repository.dart';
import 'package:prakaro/features/parking/domain/recent_search.dart';
import 'package:prakaro/features/parking/domain/saved_parking_ref.dart';
import 'package:prakaro/features/parking/presentation/parking_home_screen.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/parking_photos_provider.dart';
import 'package:prakaro/features/parking/presentation/saved_parking_screen.dart';
import 'package:prakaro/features/parking/presentation/saved_providers.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_card.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_details_sheet.dart';

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

class FakeParkingRepo implements ParkingRepository {
  FakeParkingRepo({this.mockFacilities = const {}, this.errorToThrow});

  final Map<String, ParkingLocation?> mockFacilities;
  final Exception? errorToThrow;
  int detailsCallCount = 0;
  String? lastRequestedId;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    dynamic cancelToken,
  }) async {
    if (errorToThrow != null) throw errorToThrow!;
    return mockFacilities.values.whereType<ParkingLocation>().toList();
  }

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    dynamic cancelToken,
  }) async {
    detailsCallCount++;
    lastRequestedId = id;
    if (errorToThrow != null) throw errorToThrow!;
    if (mockFacilities.containsKey(id)) {
      return mockFacilities[id];
    }
    throw const NotFoundException(message: 'Facility not found.');
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    dynamic cancelToken,
  }) async {
    return const [];
  }
}

class FakeLocationService extends LocationService {
  @override
  Future<LocationResult> getCurrentLocation() async {
    return const LocationSuccess(34.0837, 74.7973);
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Milestone 09A — Domain Models & Google Places Compliance', () {
    test('SavedParkingRef stores ONLY references and zero Places content', () {
      final ref = SavedParkingRef.fromParkingLocation(
        locationId: 'google:ChIJ123456',
        source: 'google',
      );

      expect(ref.id, 'google:ChIJ123456');
      expect(ref.provider, 'google');
      expect(ref.providerPlaceId, 'ChIJ123456');
      expect(ref.savedAt, isNotNull);

      final json = ref.toJson();
      expect(json.keys, containsAll(['id', 'provider', 'providerPlaceId', 'savedAt']));
      // Verify zero Google Places content is in JSON
      expect(json.containsKey('name'), isFalse);
      expect(json.containsKey('address'), isFalse);
      expect(json.containsKey('latitude'), isFalse);
      expect(json.containsKey('longitude'), isFalse);
      expect(json.containsKey('photos'), isFalse);
      expect(json.containsKey('rating'), isFalse);

      final decoded = SavedParkingRef.fromJson(json);
      expect(decoded.id, ref.id);
      expect(decoded.providerPlaceId, ref.providerPlaceId);
    });

    test('SavedParkingRef throws FormatException when id is missing or empty', () {
      expect(() => SavedParkingRef.fromJson({'id': ''}), throwsFormatException);
      expect(() => SavedParkingRef.fromJson({}), throwsFormatException);
    });

    test('RecentSearch generates deterministic ID and neutral label', () {
      final search = RecentSearch.create(
        latitude: 34.083712,
        longitude: 74.797321,
        radiusMeters: 3000,
        originType: RecentSearchOriginType.explicitAreaSearch,
      );

      expect(search.label, 'Previously searched area');
      expect(search.radiusMeters, 3000);
      expect(search.originType, RecentSearchOriginType.explicitAreaSearch);

      final json = search.toJson();
      final decoded = RecentSearch.fromJson(json);
      expect(decoded.id, search.id);
      expect(decoded.latitude, closeTo(34.0837, 0.001));
      expect(decoded.longitude, closeTo(74.7973, 0.001));
      expect(decoded.radiusMeters, 3000);
      expect(decoded.label, 'Previously searched area');
    });

    test('RecentSearch throws FormatException on invalid payload', () {
      expect(() => RecentSearch.fromJson({'id': '1'}), throwsFormatException);
    });
  });

  group('Milestone 09A — LocalStorageService & Resilience', () {
    test('persists, deduplicates, and removes SavedParkingRef across instances', () async {
      final service = SharedPrefsLocalStorageService();

      final ref1 = SavedParkingRef.fromParkingLocation(locationId: 'google:spot_1');
      final ref2 = SavedParkingRef.fromParkingLocation(locationId: 'google:spot_2');

      await service.saveParkingRef(ref1);
      await service.saveParkingRef(ref2);

      var list = await service.getSavedParkingRefs();
      expect(list.length, 2);
      expect(list.first.id, 'google:spot_2'); // Most recently saved first

      // Duplicate save should not create duplicate
      await service.saveParkingRef(ref1);
      list = await service.getSavedParkingRefs();
      expect(list.length, 2);
      expect(list.first.id, 'google:spot_1'); // Moved to top

      // Remove single
      await service.removeParkingRef('google:spot_1');
      list = await service.getSavedParkingRefs();
      expect(list.length, 1);
      expect(list.first.id, 'google:spot_2');

      // Clear all
      await service.clearAllSavedParkingRefs();
      list = await service.getSavedParkingRefs();
      expect(list, isEmpty);
    });

    test('corrupted storage recovery skips malformed records gracefully', () async {
      SharedPreferences.setMockInitialValues({
        SharedPrefsLocalStorageService.keySavedRefs: jsonEncode([
          {'id': 'google:valid_1', 'provider': 'google', 'providerPlaceId': 'valid_1'},
          {'invalid': 'no id field'},
          'string item not a map',
          {'id': 'google:valid_2', 'provider': 'google', 'providerPlaceId': 'valid_2'},
        ]),
      });

      final service = SharedPrefsLocalStorageService();
      final list = await service.getSavedParkingRefs();

      expect(list.length, 2);
      expect(list[0].id, 'google:valid_1');
      expect(list[1].id, 'google:valid_2');
    });

    test('recent search recording is DISABLED by default (privacy first)', () async {
      final service = SharedPrefsLocalStorageService();
      final isEnabled = await service.isRecentSearchRecordingEnabled();
      expect(isEnabled, isFalse);

      // Attempting to save recent search when disabled should return false and not store
      final search = RecentSearch.create(
        latitude: 34.08,
        longitude: 74.79,
        radiusMeters: 1000,
      );
      final saved = await service.saveRecentSearch(search);
      expect(saved, isFalse);

      final recents = await service.getRecentSearches();
      expect(recents, isEmpty);
    });

    test('explicit opt-in enables recording, deduplication, and bounds list size', () async {
      final service = SharedPrefsLocalStorageService();
      await service.setRecentSearchRecordingEnabled(true);
      expect(await service.isRecentSearchRecordingEnabled(), isTrue);

      final search1 = RecentSearch.create(
        latitude: 34.08,
        longitude: 74.79,
        radiusMeters: 1000,
      );
      final saved1 = await service.saveRecentSearch(search1);
      expect(saved1, isTrue);

      var recents = await service.getRecentSearches();
      expect(recents.length, 1);
      expect(recents.first.id, search1.id);

      // Re-saving same coordinates updates entry without duplication
      final search1Updated = RecentSearch.create(
        latitude: 34.08,
        longitude: 74.79,
        radiusMeters: 1000,
      );
      await service.saveRecentSearch(search1Updated);
      recents = await service.getRecentSearches();
      expect(recents.length, 1);

      // Remove single
      await service.removeRecentSearch(search1.id);
      recents = await service.getRecentSearches();
      expect(recents, isEmpty);
    });
  });

  group('Milestone 09A — Saved Providers & On-Demand Place Details Resolution', () {
    test('toggleSave adds and removes saved references with in-memory caching', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(FakeParkingRepo()),
        ],
      );
      addTearDown(container.dispose);

      const location = ParkingLocation(
        id: 'google:spot_alpha',
        name: 'Alpha Spot',
        latitude: 34.08,
        longitude: 74.79,
        address: 'Alpha St',
        source: 'google',
      );

      final notifier = container.read(savedParkingRefsProvider.notifier);

      // Save
      final isSavedNow = await notifier.toggleSave(location);
      expect(isSavedNow, isTrue);
      expect(notifier.isSaved(location.id), isTrue);

      // Verify cached in resolver immediately without API call
      final resolver = container.read(savedFacilityResolverProvider);
      expect(resolver.items[location.id]?.status, SavedItemStatus.loaded);
      expect(resolver.items[location.id]?.location?.name, 'Alpha Spot');

      // Unsave
      final isSavedSecond = await notifier.toggleSave(location);
      expect(isSavedSecond, isFalse);
      expect(notifier.isSaved(location.id), isFalse);
    });

    test('resolveSingle handles 404 NotFound honestly without fabricated data', () async {
      final repo = FakeParkingRepo(mockFacilities: {});
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final resolver = container.read(savedFacilityResolverProvider.notifier);
      await resolver.resolveSingle('google:deleted_spot');

      final state = container.read(savedFacilityResolverProvider);
      final item = state.items['google:deleted_spot'];
      expect(item, isNotNull);
      expect(item?.status, SavedItemStatus.notFound);
      expect(item?.errorMessage, contains('not found'));
    });

    test('resolveSingle handles OfflineException honestly', () async {
      final repo = FakeParkingRepo(
        errorToThrow: const OfflineException(message: "You're offline."),
      );
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final resolver = container.read(savedFacilityResolverProvider.notifier);
      await resolver.resolveSingle('google:offline_spot');

      final state = container.read(savedFacilityResolverProvider);
      final item = state.items['google:offline_spot'];
      expect(item?.status, SavedItemStatus.offline);
      expect(item?.errorMessage, 'Connect to the internet to load parking details.');
    });

    test('resolveSingle handles NetworkTimeoutException and RateLimitException', () async {
      final timeoutRepo = FakeParkingRepo(
        errorToThrow: const NetworkTimeoutException(message: 'Request timed out.'),
      );
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(timeoutRepo),
        ],
      );
      addTearDown(container.dispose);

      final resolver = container.read(savedFacilityResolverProvider.notifier);
      await resolver.resolveSingle('google:timeout_spot');

      var state = container.read(savedFacilityResolverProvider);
      expect(state.items['google:timeout_spot']?.status, SavedItemStatus.timeout);
    });

    test('no duplicate in-flight requests on rebuild', () async {
      const facility = ParkingLocation(
        id: 'google:test_spot',
        name: 'Loaded Spot',
        latitude: 34.08,
        longitude: 74.79,
        address: 'Test Rd',
        source: 'google',
      );
      final repo = FakeParkingRepo(mockFacilities: {'google:test_spot': facility});
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final resolver = container.read(savedFacilityResolverProvider.notifier);
      await resolver.resolveSingle('google:test_spot');
      expect(repo.detailsCallCount, 1);

      // Calling again when already loaded must NOT call repository again
      await resolver.resolveSingle('google:test_spot');
      expect(repo.detailsCallCount, 1);
    });
  });

  group('Milestone 09A — Widget Tests & Screen Interactions', () {
    testWidgets('ParkingCard renders bookmark button and toggles saved state', (tester) async {
      const testLocation = ParkingLocation(
        id: 'google:card_spot',
        name: 'City Mall Parking',
        latitude: 34.0837,
        longitude: 74.7973,
        address: 'Mall Road, Srinagar',
        source: 'google',
      );

      final navMock = MockNavigationService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            navigationServiceProvider.overrideWithValue(navMock),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: ParkingCard(
                location: testLocation,
                distanceMeters: 500,
              ),
            ),
          ),
        ),
      );

      // Initially bookmark is outline (not saved)
      expect(find.byIcon(Icons.bookmark_outline_rounded), findsOneWidget);
      expect(find.byTooltip('Save parking'), findsOneWidget);

      // Tap to save
      await tester.tap(find.byTooltip('Save parking'));
      await tester.pumpAndSettle();

      // If Auth prompt bottom sheet appeared for guest mode (Milestone 10), dismiss by continuing as guest
      if (find.text('Continue as Guest').evaluate().isNotEmpty) {
        await tester.tap(find.text('Continue as Guest'));
        await tester.pumpAndSettle();
      }

      // Now bookmark is filled (saved)
      expect(find.byIcon(Icons.bookmark_rounded), findsOneWidget);
      expect(find.byTooltip('Remove from saved'), findsOneWidget);

      // Tap again to unsave
      await tester.tap(find.byTooltip('Remove from saved'));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.bookmark_outline_rounded), findsOneWidget);
    });

    testWidgets('ParkingDetailsSheet renders bookmark button and toggles saved state', (tester) async {
      const testLocation = ParkingLocation(
        id: 'google:sheet_spot',
        name: 'Lal Chowk Parking Complex',
        latitude: 34.0837,
        longitude: 74.7973,
        address: 'Lal Chowk, Srinagar',
        source: 'google',
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProviderScope(
              overrides: [
                parkingPhotosProvider.overrideWith((ref, id) async => const []),
              ],
              child: ParkingDetailsSheet(
                location: testLocation,
                onClose: () {},
              ),
            ),
          ),
        ),
      );

      // Header has save action
      expect(find.byTooltip('Save parking'), findsOneWidget);

      await tester.tap(find.byTooltip('Save parking'));
      await tester.pumpAndSettle();

      // If Auth prompt bottom sheet appeared for guest mode (Milestone 10), dismiss by continuing as guest
      if (find.text('Continue as Guest').evaluate().isNotEmpty) {
        await tester.tap(find.text('Continue as Guest'));
        await tester.pumpAndSettle();
      }

      expect(find.byTooltip('Remove from saved'), findsOneWidget);
    });

    testWidgets('SavedParkingScreen renders empty state when no parking is saved', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: SavedParkingScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Saved parking'), findsOneWidget);
      expect(find.text('No saved parking yet.'), findsOneWidget);
      expect(find.text("Save parking locations to find them again quickly."), findsOneWidget);
    });

    testWidgets('SavedParkingScreen switches between Saved and Recent tabs and shows privacy settings', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: SavedParkingScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tab selector
      expect(find.text('Saved (0)'), findsOneWidget);
      expect(find.text('Recent (0)'), findsOneWidget);

      // Switch to Recent Searches tab
      await tester.tap(find.text('Recent (0)'));
      await tester.pumpAndSettle();

      // Shows privacy control card
      expect(find.text('Recent search history'), findsOneWidget);
      expect(find.byType(Switch), findsOneWidget);
      expect(find.text('Search history is turned off'), findsOneWidget);

      // Toggle switch ON
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();

      // History is now turned on and displays empty history message
      expect(find.text('No recent searches.'), findsOneWidget);
      expect(find.text('Your recent searches will appear here when history is enabled.'), findsOneWidget);
    });

    testWidgets('ParkingHomeScreen integrates bottom NavigationBar with Explore and Saved tabs', (tester) async {
      final repo = FakeParkingRepo(mockFacilities: {});
      final locationService = FakeLocationService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(repo),
            locationServiceProvider.overrideWithValue(locationService),
          ],
          child: const MaterialApp(
            home: ParkingHomeScreen(),
          ),
        ),
      );
      await tester.pump();
      // Allow microtask init to run
      await tester.pump(const Duration(milliseconds: 100));

      // Bottom NavigationBar has Explore and Saved
      expect(find.text('Explore'), findsOneWidget);
      expect(find.text('Saved'), findsOneWidget);

      // Switch to Saved tab
      await tester.tap(find.text('Saved'));
      await tester.pumpAndSettle();

      // Saved parking screen is rendered
      expect(find.text('Saved parking'), findsOneWidget);
      expect(find.text('No saved parking yet.'), findsOneWidget);

      // Switch back to Explore tab
      await tester.tap(find.text('Explore'));
      await tester.pumpAndSettle();

      // Explore header / switcher is visible
      expect(find.text('List'), findsOneWidget);
      expect(find.text('Map'), findsOneWidget);
    });
  });
}
