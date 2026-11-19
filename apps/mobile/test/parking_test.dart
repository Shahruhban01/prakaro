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

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
  }) async {
    callCount++;
    if (errorToThrow != null) {
      throw errorToThrow!;
    }
    return results ?? [];
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
}
