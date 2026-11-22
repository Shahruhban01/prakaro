import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/errors/app_exception.dart';
import 'package:prakaro/core/network/api_client.dart';
import 'package:prakaro/core/services/location_service.dart';
import 'package:prakaro/features/parking/data/parking_location_dto.dart';
import 'package:prakaro/features/parking/data/parking_remote_data_source.dart';
import 'package:prakaro/features/parking/data/parking_repository_impl.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/domain/parking_photo.dart';
import 'package:prakaro/features/parking/domain/parking_repository.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';

class MockApiClient extends ApiClient {
  MockApiClient({this.handler}) : super(Dio());

  final Future<Response<dynamic>> Function(
    String path,
    Map<String, dynamic>? queryParameters,
  )? handler;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    bool enableRetry = true,
  }) async {
    if (handler != null) {
      final res = await handler!(path, queryParameters);
      return Response<T>(
        data: res.data as T,
        statusCode: res.statusCode,
        requestOptions: res.requestOptions,
      );
    }
    throw const NetworkException(message: 'Unhandled mock request');
  }
}

class FakeLocationService extends LocationService {
  FakeLocationService({this.result});

  final LocationResult? result;

  @override
  Future<LocationResult> getCurrentLocation() async {
    return result ?? const LocationSuccess(34.0837, 74.7973);
  }
}

class FakeParkingRepository implements ParkingRepository {
  FakeParkingRepository({this.results, this.errorToThrow});

  final List<ParkingLocation>? results;
  final Exception? errorToThrow;
  int callCount = 0;
  int? lastRadius;
  double? lastLatitude;
  double? lastLongitude;
  CancelToken? lastCancelToken;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) async {
    callCount++;
    lastLatitude = latitude;
    lastLongitude = longitude;
    lastRadius = radius;
    lastCancelToken = cancelToken;
    if (errorToThrow != null) {
      throw errorToThrow!;
    }
    return results ?? [];
  }

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async {
    if (errorToThrow != null) {
      throw errorToThrow!;
    }
    return results?.where((l) => l.id == id).firstOrNull;
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) async {
    return const [];
  }

  @override
  Future<bool> reportFacility({
    required String placeId,
    required String category,
    String? notes,
    CancelToken? cancelToken,
  }) async {
    return true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('1. Parking DTO parsing', () {
    test('parses complete valid json and converts to domain', () {
      final json = {
        'id': 'google:ch_123',
        'name': 'Central City Parking',
        'latitude': 34.0837,
        'longitude': 74.7973,
        'address': '123 Main Street',
        'source': 'google',
      };

      final dto = ParkingLocationDto.fromJson(json);
      expect(dto.id, 'google:ch_123');
      expect(dto.name, 'Central City Parking');
      expect(dto.latitude, 34.0837);
      expect(dto.longitude, 74.7973);
      expect(dto.address, '123 Main Street');
      expect(dto.source, 'google');

      final domain = dto.toDomain();
      expect(domain.id, dto.id);
      expect(domain.name, dto.name);
      expect(domain.latitude, dto.latitude);
      expect(domain.longitude, dto.longitude);
      expect(domain.address, dto.address);
      expect(domain.source, dto.source);
    });

    test('applies safe fallbacks for missing name and address', () {
      final json = {
        'id': 'google:fallback_test',
        'name': '',
        'latitude': 12.97,
        'longitude': 77.59,
        'address': null,
      };

      final dto = ParkingLocationDto.fromJson(json);
      expect(dto.name, 'Parking Facility');
      expect(dto.address, 'Address unavailable');
    });

    test('throws FormatException if id is missing or coordinates are invalid', () {
      expect(
        () => ParkingLocationDto.fromJson({'latitude': 12.0, 'longitude': 77.0}),
        throwsA(isA<FormatException>()),
      );

      expect(
        () => ParkingLocationDto.fromJson({'id': 'test', 'latitude': null, 'longitude': 77.0}),
        throwsA(isA<FormatException>()),
      );
    });
  });

  group('2. Parking repository success', () {
    test('fetches and maps DTOs to domain entities successfully', () async {
      final mockClient = MockApiClient(
        handler: (path, params) async {
          expect(path, '/api/v1/parking/nearby');
          expect(params?['latitude'], 34.0837);
          expect(params?['longitude'], 74.7973);
          expect(params?['radius'], 2500);

          return Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: path),
            statusCode: 200,
            data: {
              'data': [
                {
                  'id': 'google:p1',
                  'name': 'Market Parking',
                  'latitude': 34.085,
                  'longitude': 74.799,
                  'address': 'Main Market',
                  'source': 'google',
                },
              ],
              'meta': {'count': 1, 'radiusMeters': 2500},
            },
          );
        },
      );

      final dataSource = ParkingRemoteDataSourceImpl(mockClient);
      final repository = ParkingRepositoryImpl(dataSource);

      final results = await repository.getNearbyParking(
        latitude: 34.0837,
        longitude: 74.7973,
        radius: 2500,
      );

      expect(results.length, 1);
      expect(results.first.id, 'google:p1');
      expect(results.first.name, 'Market Parking');
    });
  });

  group('3. Empty parking response', () {
    test('returns empty list when backend returns empty data array', () async {
      final mockClient = MockApiClient(
        handler: (path, params) async {
          return Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: path),
            statusCode: 200,
            data: {
              'data': [],
              'meta': {'count': 0, 'radiusMeters': 3000},
            },
          );
        },
      );

      final dataSource = ParkingRemoteDataSourceImpl(mockClient);
      final repository = ParkingRepositoryImpl(dataSource);

      final results = await repository.getNearbyParking(
        latitude: 34.0837,
        longitude: 74.7973,
      );

      expect(results, isEmpty);
    });
  });

  group('4. Backend error handling', () {
    test('propagates NetworkException on HTTP failure', () async {
      final mockClient = MockApiClient(
        handler: (path, params) async {
          throw const NetworkException(
            message: 'Parking discovery service is not configured.',
            statusCode: 503,
          );
        },
      );

      final dataSource = ParkingRemoteDataSourceImpl(mockClient);
      final repository = ParkingRepositoryImpl(dataSource);

      expect(
        () => repository.getNearbyParking(latitude: 34.0837, longitude: 74.7973),
        throwsA(
          isA<NetworkException>().having((e) => e.statusCode, 'statusCode', 503),
        ),
      );
    });
  });

  group('5. Parking provider loading state', () {
    test('transitions to loading state while search is in flight', () async {
      final fakeRepo = FakeParkingRepository(
        results: [
          const ParkingLocation(
            id: 'google:p1',
            name: 'Lot A',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Addr',
            source: 'google',
          ),
        ],
      );

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(
              result: const LocationSuccess(34.0837, 74.7973),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      final future = notifier.searchNearby(latitude: 34.0837, longitude: 74.7973);

      expect(container.read(parkingMapProvider).status, ParkingMapStatus.loading);
      expect(container.read(parkingMapProvider).isLoading, isTrue);

      await future;
    });
  });

  group('6. Parking provider success state', () {
    test('transitions to loaded status with locations when search succeeds', () async {
      final locations = [
        const ParkingLocation(
          id: 'google:p1',
          name: 'City Lot',
          latitude: 34.08,
          longitude: 74.79,
          address: 'Road 1',
          source: 'google',
        ),
      ];

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(results: locations),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.0837, 74.7973)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.0837, longitude: 74.7973);

      final state = container.read(parkingMapProvider);
      expect(state.status, ParkingMapStatus.loaded);
      expect(state.locations.length, 1);
      expect(state.locations.first.id, 'google:p1');
    });
  });

  group('7. Parking provider error state', () {
    test('transitions to backendUnavailable on 503 configuration error', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(
              errorToThrow: const NetworkException(
                message: 'Parking discovery service is not configured.',
                statusCode: 503,
              ),
            ),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.0837, 74.7973)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.0837, longitude: 74.7973);

      final state = container.read(parkingMapProvider);
      expect(state.status, ParkingMapStatus.backendUnavailable);
      expect(state.errorMessage, contains('not configured'));
    });
  });

  group('8. Invalid or malformed response handling', () {
    test('throws AppException when data key is missing from response payload', () async {
      final mockClient = MockApiClient(
        handler: (path, params) async {
          return Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: path),
            statusCode: 200,
            data: {'meta': {}},
          );
        },
      );

      final dataSource = ParkingRemoteDataSourceImpl(mockClient);
      expect(
        () => dataSource.getNearbyParking(latitude: 34.0837, longitude: 74.7973),
        throwsA(isA<AppException>()),
      );
    });

    test('skips malformed array items while keeping valid items', () async {
      final mockClient = MockApiClient(
        handler: (path, params) async {
          return Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: path),
            statusCode: 200,
            data: {
              'data': [
                {'invalid': 'no id or coords'},
                {
                  'id': 'google:valid_1',
                  'name': 'Valid Spot',
                  'latitude': 34.08,
                  'longitude': 74.79,
                  'address': 'Street',
                  'source': 'google',
                },
                {'id': 'google:missing_coords'},
              ],
              'meta': {'count': 3},
            },
          );
        },
      );

      final dataSource = ParkingRemoteDataSourceImpl(mockClient);
      final results = await dataSource.getNearbyParking(
        latitude: 34.0837,
        longitude: 74.7973,
      );

      expect(results.length, 1);
      expect(results.first.id, 'google:valid_1');
    });
  });

  group('9. Distance formatting & sorting', () {
    test('formats meters and kilometers correctly', () {
      expect(ParkingMapState.formatDistance(null), 'Distance unavailable');
      expect(ParkingMapState.formatDistance(45.2), '45 m');
      expect(ParkingMapState.formatDistance(780), '780 m');
      expect(ParkingMapState.formatDistance(1000), '1.0 km');
      expect(ParkingMapState.formatDistance(2350), '2.4 km');
    });

    test('sorts parking locations by ascending straight-line distance', () {
      // User at (0, 0)
      // Loc 1: at (0.02, 0) ~2.2 km away
      // Loc 2: at (0.005, 0) ~550 m away
      // Loc 3: at (0.05, 0) ~5.5 km away
      final locations = [
        const ParkingLocation(
          id: 'loc_far',
          name: 'Far Lot',
          latitude: 0.02,
          longitude: 0.0,
          address: 'Far St',
          source: 'google',
        ),
        const ParkingLocation(
          id: 'loc_near',
          name: 'Near Lot',
          latitude: 0.005,
          longitude: 0.0,
          address: 'Near St',
          source: 'google',
        ),
        const ParkingLocation(
          id: 'loc_very_far',
          name: 'Very Far Lot',
          latitude: 0.05,
          longitude: 0.0,
          address: 'Very Far St',
          source: 'google',
        ),
      ];

      final state = ParkingMapState(
        userLatitude: 0.0,
        userLongitude: 0.0,
        locations: locations,
      );

      final sorted = state.sortedLocationsWithDistance;
      expect(sorted.length, 3);
      expect(sorted[0].location.id, 'loc_near');
      expect(sorted[1].location.id, 'loc_far');
      expect(sorted[2].location.id, 'loc_very_far');

      expect(state.nearestLocations.map((l) => l.id).toList(), [
        'loc_near',
        'loc_far',
        'loc_very_far',
      ]);
    });
  });

  group('10. View switching & shared Riverpod state', () {
    test('switches viewMode between list and map without resetting locations', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);

      // Default mode is list
      expect(container.read(parkingMapProvider).viewMode, ParkingViewMode.list);

      // Switch to map
      notifier.setViewMode(ParkingViewMode.map);
      expect(container.read(parkingMapProvider).viewMode, ParkingViewMode.map);

      // Switch back to list
      notifier.setViewMode(ParkingViewMode.list);
      expect(container.read(parkingMapProvider).viewMode, ParkingViewMode.list);
    });
  });

  group('11. No duplicate backend requests on view switching', () {
    test('switching views does not invoke the repository again', () async {
      final fakeRepo = FakeParkingRepository(
        results: [
          const ParkingLocation(
            id: 'google:p1',
            name: 'P1',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Addr',
            source: 'google',
          ),
        ],
      );

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.0837, 74.7973)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();

      expect(fakeRepo.callCount, 1);

      // Switch to map
      notifier.setViewMode(ParkingViewMode.map);
      expect(fakeRepo.callCount, 1); // No new request!

      // Switch back to list
      notifier.setViewMode(ParkingViewMode.list);
      expect(fakeRepo.callCount, 1); // No new request!

      // Re-calling init without force should also not re-query if loaded
      await notifier.init(force: false);
      expect(fakeRepo.callCount, 1);
    });
  });

  group('12. Pull-to-refresh behavior', () {
    test('refresh invokes repository and updates locations in shared state', () async {
      final fakeRepo = FakeParkingRepository(
        results: [
          const ParkingLocation(
            id: 'google:p1',
            name: 'Initial Lot',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Addr',
            source: 'google',
          ),
        ],
      );

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.0837, 74.7973)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.callCount, 1);

      // Trigger pull-to-refresh
      await notifier.refresh();
      expect(fakeRepo.callCount, 2);
      expect(container.read(parkingMapProvider).locations.length, 1);
    });
  });

  group('13. Enriched metadata parsing and resilience', () {
    test('parses enriched metadata with pricing, hours, and parking options', () {
      final json = {
        'id': 'google:ch_enriched',
        'name': 'Enriched Parking Garage',
        'latitude': 34.0837,
        'longitude': 74.7973,
        'address': '789 Grand Blvd',
        'source': 'google',
        'accessType': 'public',
        'ownershipType': 'public',
        'pricingType': 'free',
        'openingStatus': 'open',
        'parkingOptions': {
          'freeParkingLot': true,
          'paidParkingLot': false,
          'freeGarageParking': true,
        },
        'hourlyRate': null,
        'currency': null,
      };

      final dto = ParkingLocationDto.fromJson(json);
      expect(dto.pricingType, PricingType.free);
      expect(dto.openingStatus, OpeningStatus.open);
      expect(dto.accessType, AccessType.public);
      expect(dto.ownershipType, OwnershipType.public);
      expect(dto.parkingOptions.freeParkingLot, true);
      expect(dto.parkingOptions.freeGarageParking, true);

      final domain = dto.toDomain();
      expect(domain.isConfirmedFree, true);
      expect(domain.isConfirmedPaid, false);
      expect(domain.isConfirmedOpen, true);
      expect(domain.isConfirmedClosed, false);
      expect(domain.isConfirmedPublic, true);
    });

    test('gracefully handles missing, null, or unknown metadata fields', () {
      final json = {
        'id': 'google:ch_minimal',
        'name': 'Minimal Lot',
        'latitude': 34.08,
        'longitude': 74.79,
        'accessType': 'UNKNOWN_VALUE',
        'pricingType': 'SOMETHING_ELSE',
        'openingStatus': null,
      };

      final dto = ParkingLocationDto.fromJson(json);
      expect(dto.accessType, AccessType.unknown);
      expect(dto.pricingType, PricingType.unknown);
      expect(dto.openingStatus, OpeningStatus.unknown);
      expect(dto.parkingOptions.freeParkingLot, null);

      final domain = dto.toDomain();
      expect(domain.isConfirmedFree, false);
      expect(domain.isConfirmedPaid, false);
      expect(domain.isConfirmedOpen, false);
      expect(domain.isConfirmedPublic, false);
    });
  });

  group('14. Smart filter state and mutual exclusivity', () {
    test('selecting Free clears Paid and filters list correctly', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      expect(container.read(parkingMapProvider).pricingFilter, PricingFilter.all);

      // Select Free
      notifier.setPricingFilter(PricingFilter.free);
      expect(container.read(parkingMapProvider).pricingFilter, PricingFilter.free);

      // Switch to Paid (mutually exclusive)
      notifier.setPricingFilter(PricingFilter.paid);
      expect(container.read(parkingMapProvider).pricingFilter, PricingFilter.paid);

      // Back to All
      notifier.setPricingFilter(PricingFilter.all);
      expect(container.read(parkingMapProvider).pricingFilter, PricingFilter.all);
    });

    test('combining filters and clearing all filters', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);

      notifier.setPricingFilter(PricingFilter.free);
      notifier.toggleOpenNow();
      notifier.togglePublicAccess();

      final state = container.read(parkingMapProvider);
      expect(state.pricingFilter, PricingFilter.free);
      expect(state.openNowFilter, true);
      expect(state.publicAccessFilter, true);
      expect(state.activeFilterCount, 3);
      expect(state.isAnyFilterActive, true);

      // Clear all
      notifier.clearFilters();
      final cleared = container.read(parkingMapProvider);
      expect(cleared.pricingFilter, PricingFilter.all);
      expect(cleared.openNowFilter, false);
      expect(cleared.publicAccessFilter, false);
      expect(cleared.activeFilterCount, 0);
      expect(cleared.isAnyFilterActive, false);
    });

    test('filteredLocations correctly excludes non-matching facilities', () {
      const freeLot = ParkingLocation(
        id: 'loc_free',
        name: 'Free Lot',
        latitude: 34.08,
        longitude: 74.79,
        address: 'Free St',
        source: 'google',
        pricingType: PricingType.free,
        openingStatus: OpeningStatus.open,
      );

      const paidLot = ParkingLocation(
        id: 'loc_paid',
        name: 'Paid Lot',
        latitude: 34.09,
        longitude: 74.80,
        address: 'Paid St',
        source: 'google',
        pricingType: PricingType.paid,
        openingStatus: OpeningStatus.closed,
      );

      const mixedLot = ParkingLocation(
        id: 'loc_mixed',
        name: 'Mixed Lot',
        latitude: 34.07,
        longitude: 74.78,
        address: 'Mixed St',
        source: 'google',
        pricingType: PricingType.mixed,
        openingStatus: OpeningStatus.open,
      );

      final state = ParkingMapState(
        status: ParkingMapStatus.loaded,
        locations: [freeLot, paidLot, mixedLot],
        userLatitude: 34.08,
        userLongitude: 74.79,
      );

      // All filters (default): all 3 present
      expect(state.filteredLocations.length, 3);

      // Free filter: includes freeLot and mixedLot
      final freeState = state.copyWith(pricingFilter: PricingFilter.free);
      expect(freeState.filteredLocations.map((l) => l.id).toList(), ['loc_free', 'loc_mixed']);

      // Paid filter: includes paidLot and mixedLot
      final paidState = state.copyWith(pricingFilter: PricingFilter.paid);
      expect(paidState.filteredLocations.map((l) => l.id).toList(), ['loc_paid', 'loc_mixed']);

      // Open now filter: includes freeLot and mixedLot
      final openState = state.copyWith(openNowFilter: true);
      expect(openState.filteredLocations.map((l) => l.id).toList(), ['loc_free', 'loc_mixed']);

      // Public access filter: since none have accessType == public, returns empty and triggers isFilterEmpty
      final publicState = state.copyWith(publicAccessFilter: true);
      expect(publicState.filteredLocations.isEmpty, true);
      expect(publicState.isFilterEmpty, true);
    });
  });

  group('14. Milestone 07: Search radius controls & smarter discovery', () {
    test('1. Default radius is 3000 meters and supported radii include 1000, 3000, 5000', () {
      const state = ParkingMapState();
      expect(state.radiusMeters, 3000);
      expect(state.searchRadiusKm, 3);
      expect(ParkingMapState.supportedRadiiMeters, [1000, 3000, 5000]);
      expect(ParkingMapState.defaultRadiusMeters, 3000);
    });

    test('2. Selecting 1 km sends radius=1000 to backend', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.lastRadius, 3000);

      await notifier.setRadius(1000);
      await Future<void>.delayed(const Duration(milliseconds: 400));
      expect(container.read(parkingMapProvider).radiusMeters, 1000);
      expect(container.read(parkingMapProvider).searchRadiusKm, 1);
      expect(fakeRepo.lastRadius, 1000);
    });

    test('3. Selecting 3 km sends radius=3000 to backend', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      await notifier.setRadius(1000);
      await Future<void>.delayed(const Duration(milliseconds: 400));
      expect(fakeRepo.lastRadius, 1000);

      await notifier.setRadius(3000);
      await Future<void>.delayed(const Duration(milliseconds: 400));
      expect(container.read(parkingMapProvider).radiusMeters, 3000);
      expect(fakeRepo.lastRadius, 3000);
    });

    test('4. Selecting 5 km sends radius=5000 to backend', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();

      await notifier.setRadius(5000);
      await Future<void>.delayed(const Duration(milliseconds: 400));
      expect(container.read(parkingMapProvider).radiusMeters, 5000);
      expect(container.read(parkingMapProvider).searchRadiusKm, 5);
      expect(fakeRepo.lastRadius, 5000);
    });

    test('5. Unchanged radius does not trigger duplicate request', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.callCount, 1);

      // Attempting to select 3000 again when it is already 3000
      await notifier.setRadius(3000);
      expect(fakeRepo.callCount, 1); // No new network call
    });

    test('6. Radius persists across List/Map view mode switching', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      await notifier.setRadius(5000);

      notifier.setViewMode(ParkingViewMode.map);
      expect(container.read(parkingMapProvider).viewMode, ParkingViewMode.map);
      expect(container.read(parkingMapProvider).radiusMeters, 5000);

      notifier.setViewMode(ParkingViewMode.list);
      expect(container.read(parkingMapProvider).viewMode, ParkingViewMode.list);
      expect(container.read(parkingMapProvider).radiusMeters, 5000);
    });

    test('7. Active filters persist when radius changes', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();

      notifier.setPricingFilter(PricingFilter.free);
      notifier.toggleOpenNow();

      expect(container.read(parkingMapProvider).pricingFilter, PricingFilter.free);
      expect(container.read(parkingMapProvider).openNowFilter, true);

      // Change radius
      await notifier.setRadius(1000);
      final afterRadius = container.read(parkingMapProvider);
      expect(afterRadius.radiusMeters, 1000);
      expect(afterRadius.pricingFilter, PricingFilter.free);
      expect(afterRadius.openNowFilter, true);
    });

    test('8. Clearing filters preserves active radius selection', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      await notifier.setRadius(5000);

      notifier.setPricingFilter(PricingFilter.paid);
      notifier.togglePublicAccess();
      expect(container.read(parkingMapProvider).activeFilterCount, 2);

      notifier.clearFilters();
      final afterClear = container.read(parkingMapProvider);
      expect(afterClear.activeFilterCount, 0);
      expect(afterClear.pricingFilter, PricingFilter.all);
      expect(afterClear.radiusMeters, 5000); // Radius preserved!
    });

    test('9. Map search uses camera center and marks isCustomSearchArea true', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(container.read(parkingMapProvider).isCustomSearchArea, false);

      // Camera pans to new area
      notifier.onCameraIdle(34.1200, 74.8500);
      expect(container.read(parkingMapProvider).canSearchArea, true);

      // User taps "Search this area"
      await notifier.searchCurrentArea();

      final state = container.read(parkingMapProvider);
      expect(state.isCustomSearchArea, true);
      expect(state.searchCenterLatitude, 34.1200);
      expect(state.searchCenterLongitude, 74.8500);
      expect(fakeRepo.lastLatitude, 34.1200);
      expect(fakeRepo.lastLongitude, 74.8500);
      expect(fakeRepo.lastRadius, 3000);
    });

    test('10. searchNearUser resets isCustomSearchArea and centers on GPS coordinates', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.0800, 74.7900)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();

      // Pan to custom area
      notifier.onCameraIdle(34.2000, 74.9000);
      await notifier.searchCurrentArea();
      expect(container.read(parkingMapProvider).isCustomSearchArea, true);

      // Return near user
      await notifier.searchNearUser();
      final state = container.read(parkingMapProvider);
      expect(state.isCustomSearchArea, false);
      expect(fakeRepo.lastLatitude, 34.0800);
      expect(fakeRepo.lastLongitude, 74.7900);
    });

    test('11. Stale responses cannot overwrite newer results', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);

      // Fast successive calls: 1000m then immediately 5000m
      final search1 = notifier.setRadius(1000);
      final search2 = notifier.setRadius(5000);

      await Future.wait([search1, search2]);

      // Latest search request (5000) must prevail
      expect(container.read(parkingMapProvider).radiusMeters, 5000);
    });

    test('12. canIncreaseRadius and nextRadiusMeters properties work across tiers', () {
      const state1 = ParkingMapState(radiusMeters: 1000);
      expect(state1.canIncreaseRadius, true);
      expect(state1.nextRadiusMeters, 3000);

      const state3 = ParkingMapState(radiusMeters: 3000);
      expect(state3.canIncreaseRadius, true);
      expect(state3.nextRadiusMeters, 5000);

      const state5 = ParkingMapState(radiusMeters: 5000);
      expect(state5.canIncreaseRadius, false);
      expect(state5.nextRadiusMeters, 5000);
    });
  });

  group('8. Milestone 08 - Performance, Reliability, Concurrency & Networking', () {
    test('1. Superseded active search request CancelToken is cancelled', () async {
      CancelToken? firstToken;
      CancelToken? secondToken;

      final fakeRepo = _DelayedMockRepo(
        onCall: (token) {
          if (firstToken == null) {
            firstToken = token;
          } else {
            secondToken = token;
          }
        },
      );

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);

      // Launch first search (takes 50ms)
      final f1 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 1000);
      // Immediately launch second search which supersedes the first
      final f2 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 3000);

      await Future.wait([f1, f2]);

      expect(firstToken, isNotNull);
      expect(firstToken!.isCancelled, isTrue);
      expect(secondToken, isNotNull);
      expect(secondToken!.isCancelled, isFalse);
    });

    test('2. Cancelled request does not produce a user-facing error state', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(
              errorToThrow: const RequestCancelledException(),
            ),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.08, longitude: 74.79);

      final state = container.read(parkingMapProvider);
      // Must not be in error state
      expect(state.status, isNot(ParkingMapStatus.error));
      expect(state.errorMessage, isNull);
    });

    test('3. Older responses cannot overwrite newer search results', () async {
      final locSlow = const ParkingLocation(
        id: 'slow',
        name: 'Slow Facility',
        latitude: 34.08,
        longitude: 74.79,
        address: '100 Slow Lane',
        source: 'google',
      );
      final locFast = const ParkingLocation(
        id: 'fast',
        name: 'Fast Facility',
        latitude: 34.08,
        longitude: 74.79,
        address: '200 Fast Expressway',
        source: 'google',
      );

      int callNumber = 0;
      final dynamicRepo = _DynamicTimingRepo(handler: (lat, lng, radius, token) async {
        callNumber++;
        if (callNumber == 1) {
          // Slow first call
          await Future<void>.delayed(const Duration(milliseconds: 50));
          return [locSlow];
        } else {
          // Fast second call
          await Future<void>.delayed(const Duration(milliseconds: 5));
          return [locFast];
        }
      });

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(dynamicRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      final f1 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 1000);
      final f2 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 3000);

      await Future.wait([f1, f2]);

      final state = container.read(parkingMapProvider);
      // Fast call completed for 3000m must prevail; slow 1000m must not overwrite
      expect(state.locations.length, 1);
      expect(state.locations.first.id, 'fast');
      expect(state.radiusMeters, 3000);
    });

    test('4. Rapid radius changes are debounced into a single final search', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.callCount, 1);

      // Rapidly change radius: 1km -> 3km -> 5km within 50ms
      notifier.setRadius(1000);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      notifier.setRadius(3000);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      notifier.setRadius(5000);

      // Immediately after, callCount should still be 1 (debouncing)
      expect(fakeRepo.callCount, 1);

      // Wait for debounce timer (350ms) to fire
      await Future<void>.delayed(const Duration(milliseconds: 400));

      // Exactly 1 additional call was executed, with the final 5000m radius
      expect(fakeRepo.callCount, 2);
      expect(fakeRepo.lastRadius, 5000);
    });

    test('5. Explicit refresh and searchCurrentArea bypass debounce', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.callCount, 1);

      // Explicit refresh happens immediately without 350ms delay
      await notifier.refresh();
      expect(fakeRepo.callCount, 2);
    });

    test('6. Duplicate in-flight query is coalesced into one search', () async {
      final completer = Completer<List<ParkingLocation>>();
      final dynamicRepo = _DynamicTimingRepo(handler: (lat, lng, radius, token) {
        return completer.future;
      });

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(dynamicRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);

      // Start two concurrent identical searches
      final f1 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 3000);
      final f2 = notifier.searchNearby(latitude: 34.08, longitude: 74.79, radius: 3000);

      // Finish the response
      completer.complete([
        const ParkingLocation(
          id: 'c1',
          name: 'Coalesced Lot',
          latitude: 34.08,
          longitude: 74.79,
          address: '300 Coalesced Way',
          source: 'google',
        ),
      ]);

      await Future.wait([f1, f2]);

      // Only 1 network call was actually made
      expect(dynamicRepo.callCount, 1);
    });

    test('7. List/Map switch causes zero additional network requests', () async {
      final fakeRepo = FakeParkingRepository();
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(fakeRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(fakeRepo.callCount, 1);

      // Switch to Map
      notifier.setViewMode(ParkingViewMode.map);
      expect(fakeRepo.callCount, 1);

      // Switch back to List
      notifier.setViewMode(ParkingViewMode.list);
      expect(fakeRepo.callCount, 1);
    });

    test('8. OfflineException maps to isOffline = true with friendly message', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(errorToThrow: const OfflineException()),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.08, longitude: 74.79);

      final state = container.read(parkingMapProvider);
      expect(state.isOffline, isTrue);
      expect(state.status, ParkingMapStatus.backendUnavailable);
      expect(state.errorMessage, contains("offline"));
    });

    test('9. NetworkTimeoutException maps to isTimedOut = true', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(errorToThrow: const NetworkTimeoutException()),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.08, longitude: 74.79);

      final state = container.read(parkingMapProvider);
      expect(state.isTimedOut, isTrue);
      expect(state.errorMessage, contains("longer than expected"));
    });

    test('10. RateLimitException maps to isRateLimited = true', () async {
      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(
            FakeParkingRepository(errorToThrow: const RateLimitException()),
          ),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.searchNearby(latitude: 34.08, longitude: 74.79);

      final state = container.read(parkingMapProvider);
      expect(state.isRateLimited, isTrue);
      expect(state.errorMessage, contains("Too many searches"));
    });

    test('11. Refresh failure on SAME query preserves previous results with stale indicator', () async {
      bool throwOnNext = false;
      final dynamicRepo = _DynamicTimingRepo(handler: (lat, lng, radius, token) async {
        if (throwOnNext) {
          throw const NetworkException(message: 'Connection dropped on refresh');
        }
        return [
          const ParkingLocation(
            id: 'prev_1',
            name: 'Existing Facility',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Main Boulevard',
            source: 'google',
          ),
        ];
      });

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(dynamicRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();

      expect(container.read(parkingMapProvider).locations.length, 1);
      expect(container.read(parkingMapProvider).isStaleResults, isFalse);

      // Simulate refresh failure
      throwOnNext = true;
      await notifier.refresh();

      final state = container.read(parkingMapProvider);
      // Results must still be visible!
      expect(state.locations.length, 1);
      expect(state.locations.first.id, 'prev_1');
      expect(state.isStaleResults, isTrue);
      expect(state.staleNotice, contains('previous results'));
    });

    test('12. Failure on NEW query clears results and does not mislabel them as stale', () async {
      bool throwOnNext = false;
      final dynamicRepo = _DynamicTimingRepo(handler: (lat, lng, radius, token) async {
        if (throwOnNext) {
          throw const NetworkException(message: 'Remote server failure');
        }
        return [
          const ParkingLocation(
            id: 'prev_1',
            name: 'Existing Facility',
            latitude: 34.08,
            longitude: 74.79,
            address: 'Main Boulevard',
            source: 'google',
          ),
        ];
      });

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(dynamicRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(parkingMapProvider.notifier);
      await notifier.init();
      expect(container.read(parkingMapProvider).locations.length, 1);

      // Search a brand new area (different coordinates) that fails
      throwOnNext = true;
      await notifier.searchNearby(latitude: 35.50, longitude: 75.50, radius: 5000);

      final state = container.read(parkingMapProvider);
      // Old results must NOT be shown as if they belong to the new area
      expect(state.locations.isEmpty, isTrue);
      expect(state.isStaleResults, isFalse);
      expect(state.staleNotice, isNull);
      expect(state.status, isNot(ParkingMapStatus.loaded));
    });

    test('13. Disposed notifier does not update state', () async {
      final completer = Completer<List<ParkingLocation>>();
      final dynamicRepo = _DynamicTimingRepo(handler: (lat, lng, radius, token) {
        return completer.future;
      });

      final container = ProviderContainer(
        overrides: [
          parkingRepositoryProvider.overrideWithValue(dynamicRepo),
          locationServiceProvider.overrideWithValue(
            FakeLocationService(result: const LocationSuccess(34.08, 74.79)),
          ),
        ],
      );

      final notifier = container.read(parkingMapProvider.notifier);
      final searchFuture = notifier.searchNearby(latitude: 34.08, longitude: 74.79);

      // Dispose container before response completes
      container.dispose();

      completer.complete([
        const ParkingLocation(
          id: 'late',
          name: 'Late Facility',
          latitude: 34.08,
          longitude: 74.79,
          address: 'Late Lane',
          source: 'google',
        ),
      ]);

      await searchFuture;
      // No uncaught exception or state modification
    });
  });
}

class _DelayedMockRepo implements ParkingRepository {
  _DelayedMockRepo({required this.onCall});

  final void Function(CancelToken? token) onCall;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) async {
    onCall(cancelToken);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    return [];
  }

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async {
    return null;
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) async {
    return const [];
  }

  @override
  Future<bool> reportFacility({
    required String placeId,
    required String category,
    String? notes,
    CancelToken? cancelToken,
  }) async {
    return true;
  }
}

class _DynamicTimingRepo implements ParkingRepository {
  _DynamicTimingRepo({required this.handler});

  final Future<List<ParkingLocation>> Function(
    double lat,
    double lng,
    int? radius,
    CancelToken? cancelToken,
  ) handler;

  int callCount = 0;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) {
    callCount++;
    return handler(latitude, longitude, radius, cancelToken);
  }

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async {
    return null;
  }

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) async {
    return const [];
  }

  @override
  Future<bool> reportFacility({
    required String placeId,
    required String category,
    String? notes,
    CancelToken? cancelToken,
  }) async {
    return true;
  }
}
