import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/design/prakaro_icons.dart';

import 'package:prakaro/core/services/navigation_service.dart';
import 'package:prakaro/core/theme/app_theme.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/domain/parking_photo.dart';
import 'package:prakaro/features/parking/domain/parking_repository.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_details_sheet.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_photo_gallery.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_photo_viewer_screen.dart';

// 1x1 transparent PNG bytes for mock network image loading in tests
const List<int> _kTransparentPngBytes = <int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
];

class _MockHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return _TestMockHttpClient();
  }
}

class _TestMockHttpClient implements HttpClient {
  @override
  bool autoUncompress = true;
  @override
  Duration? connectionTimeout;
  @override
  Duration idleTimeout = const Duration(seconds: 15);
  @override
  int? maxConnectionsPerHost;
  @override
  String? userAgent;

  @override
  Future<HttpClientRequest> getUrl(Uri url) => openUrl('GET', url);

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    return _TestMockHttpClientRequest();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _TestMockHttpClientRequest implements HttpClientRequest {
  @override
  final HttpHeaders headers = _TestMockHttpHeaders();

  @override
  Future<HttpClientResponse> close() async {
    return _TestMockHttpClientResponse();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _TestMockHttpHeaders implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _TestMockHttpClientResponse implements HttpClientResponse {
  @override
  int get statusCode => 200;
  @override
  int get contentLength => _kTransparentPngBytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  final HttpHeaders headers = _TestMockHttpHeaders();

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return Stream<List<int>>.value(_kTransparentPngBytes).listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class MockParkingRepositoryForPhotos implements ParkingRepository {
  MockParkingRepositoryForPhotos({
    this.photos = const [],
    this.throwError = false,
  });

  List<ParkingPhoto> photos;
  bool throwError;
  int photosCallCount = 0;

  @override
  Future<List<ParkingLocation>> getNearbyParking({
    required double latitude,
    required double longitude,
    int? radius,
    CancelToken? cancelToken,
  }) async => [];

  @override
  Future<ParkingLocation?> getParkingDetails(
    String id, {
    CancelToken? cancelToken,
  }) async => null;

  @override
  Future<List<ParkingPhoto>> getParkingPhotos(
    String id, {
    CancelToken? cancelToken,
  }) async {
    photosCallCount++;
    if (throwError) {
      throw Exception('Network error fetching photos');
    }
    return photos;
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

class MockNavService extends NavigationService {
  bool wasLaunched = false;
  @override
  Future<bool> openDirections({
    required double destinationLatitude,
    required double destinationLongitude,
    String? destinationLabel,
  }) async {
    wasLaunched = true;
    return true;
  }
}

void main() {
  setUpAll(() {
    HttpOverrides.global = _MockHttpOverrides();
  });

  tearDownAll(() {
    HttpOverrides.global = null;
  });

  const testLocation = ParkingLocation(
    id: 'google:ChIJtest123',
    name: 'Grand Central Parking',
    latitude: 34.0837,
    longitude: 74.7973,
    address: 'Residency Road, Srinagar',
    source: 'google',
    pricingType: PricingType.paid,
    openingStatus: OpeningStatus.open,
    accessType: AccessType.public,
  );

  const samplePhotos = [
    ParkingPhoto(
      id: '0',
      width: 1920,
      height: 1080,
      source: 'google',
      mediaUrl: '/api/v1/parking/ChIJtest123/photos/0/media',
      attributions: [
        PhotoAttribution(
          displayName: 'Jane Doe',
          uri: 'https://maps.google.com/maps/contrib/123',
        ),
      ],
    ),
    ParkingPhoto(
      id: '1',
      width: 1280,
      height: 720,
      source: 'google',
      mediaUrl: '/api/v1/parking/ChIJtest123/photos/1/media',
      attributions: [
        PhotoAttribution(
          displayName: 'John Smith',
        ),
      ],
    ),
  ];

  group('Milestone 11: Domain Models & Photo Normalization', () {
    test('PhotoAttribution correctly parses JSON and serializes', () {
      final json = {
        'displayName': 'Alex Traveler',
        'uri': 'https://maps.google.com/maps/contrib/999',
      };
      final attr = PhotoAttribution.fromJson(json);

      expect(attr.displayName, 'Alex Traveler');
      expect(attr.uri, 'https://maps.google.com/maps/contrib/999');
      expect(attr.toJson(), json);
    });

    test('PhotoAttribution provides safe default when displayName is missing', () {
      final attr = PhotoAttribution.fromJson({});
      expect(attr.displayName, 'Photo Contributor');
      expect(attr.uri, isNull);
    });

    test('ParkingPhoto parses JSON, attributions and serializes accurately', () {
      final json = {
        'id': '0',
        'width': 1600,
        'height': 900,
        'source': 'google',
        'mediaUrl': '/api/v1/parking/test/photos/0/media',
        'attributions': [
          {'displayName': 'User One', 'uri': 'https://example.com/one'}
        ],
      };

      final photo = ParkingPhoto.fromJson(json);
      expect(photo.id, '0');
      expect(photo.width, 1600);
      expect(photo.height, 900);
      expect(photo.source, 'google');
      expect(photo.attributions.length, 1);
      expect(photo.attributions.first.displayName, 'User One');
    });

    test('resolvedMediaUrl resolves relative paths and appends dimension parameters', () {
      const photo = ParkingPhoto(
        id: '0',
        source: 'google',
        mediaUrl: '/api/v1/parking/abc/photos/0/media',
      );

      final urlWithDims = photo.resolvedMediaUrl(
        'http://localhost:3000',
        maxWidth: 800,
        maxHeight: 600,
      );

      expect(
        urlWithDims,
        'http://localhost:3000/api/v1/parking/abc/photos/0/media?maxWidth=800&maxHeight=600',
      );

      const absolutePhoto = ParkingPhoto(
        id: '1',
        source: 'google',
        mediaUrl: 'https://images.example.com/photo.jpg',
      );

      expect(
        absolutePhoto.resolvedMediaUrl('http://localhost:3000'),
        'https://images.example.com/photo.jpg',
      );
    });
  });

  group('Milestone 11: Widget Tests — ParkingPhotoGallery Component', () {
    testWidgets('renders empty state placeholder when facility has zero photos', (tester) async {
      final mockRepo = MockParkingRepositoryForPhotos(photos: []);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(mockRepo),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: ParkingPhotoGallery(
                parkingId: 'ChIJtest123',
                facilityName: 'Grand Central Parking',
              ),
            ),
          ),
        ),
      );

      // Loading skeleton initially
      expect(find.text('Loading photos...'), findsOneWidget);

      await tester.pumpAndSettle();

      // Empty placeholder displayed cleanly
      expect(
        find.text('No photos available for this parking location.'),
        findsOneWidget,
      );
      expect(find.byType(PrakaroIcon), findsWidgets);
    });

    testWidgets('renders error state with retry button and re-fetches on tap', (tester) async {
      final mockRepo = MockParkingRepositoryForPhotos(throwError: true);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(mockRepo),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: ParkingPhotoGallery(
                parkingId: 'ChIJtest123',
                facilityName: 'Grand Central Parking',
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pumpAndSettle();

      expect(find.text('Unable to load photos right now.'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      final initialCount = mockRepo.photosCallCount;
      expect(initialCount, greaterThan(0));

      // Fix the repo error and tap Retry
      mockRepo.throwError = false;
      mockRepo.photos = samplePhotos;

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(mockRepo.photosCallCount, greaterThan(initialCount));
      expect(find.text('1 / 2'), findsOneWidget);
    });

    testWidgets('renders photo carousel, page indicator, and swipes smoothly', (tester) async {
      final mockRepo = MockParkingRepositoryForPhotos(photos: samplePhotos);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(mockRepo),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: ParkingPhotoGallery(
                parkingId: 'ChIJtest123',
                facilityName: 'Grand Central Parking',
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify carousel is rendered with first photo count badge
      expect(find.byType(PageView), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.text('By Jane Doe'), findsOneWidget);
      expect(find.text('Tap to view'), findsOneWidget);

      // Swipe left to page 2
      await tester.fling(find.byType(PageView), const Offset(-600, 0), 1000);
      await tester.pumpAndSettle();

      expect(find.text('2 / 2'), findsOneWidget);
      expect(find.text('By John Smith'), findsOneWidget);
    });
  });

  group('Milestone 11: Widget Tests — ParkingPhotoViewerScreen', () {
    testWidgets('renders full-screen viewer, photo counter, and close button', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ParkingPhotoViewerScreen(
            photos: samplePhotos,
            initialIndex: 0,
            facilityName: 'Grand Central Parking',
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Grand Central Parking'), findsOneWidget);
      expect(find.text('Photo 1 of 2'), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);
      expect(find.text('Powered by Google'), findsOneWidget);
      expect(find.text('Jane Doe'), findsOneWidget);
      expect(find.byTooltip('Close viewer'), findsOneWidget);

      // Verify InteractiveViewer is present for pinch-to-zoom
      expect(find.byType(InteractiveViewer), findsWidgets);
    });

    testWidgets('closes full-screen photo viewer when close button is pressed', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: ElevatedButton(
                onPressed: () {
                  ParkingPhotoViewerScreen.show(
                    context,
                    photos: samplePhotos,
                    facilityName: 'Grand Central Parking',
                  );
                },
                child: const Text('Open Viewer'),
              ),
            ),
          ),
        ),
      );

      // Open viewer
      await tester.tap(find.text('Open Viewer'));
      await tester.pumpAndSettle();

      expect(find.text('Photo 1 of 2'), findsOneWidget);

      // Tap close
      await tester.tap(find.byTooltip('Close viewer'));
      await tester.pumpAndSettle();

      expect(find.text('Open Viewer'), findsOneWidget);
      expect(find.text('Photo 1 of 2'), findsNothing);
    });
  });

  group('Milestone 11: Widget Tests — ParkingDetailsSheet Integration', () {
    testWidgets('embeds photo gallery inside details sheet without breaking Save & Directions', (tester) async {
      final mockRepo = MockParkingRepositoryForPhotos(photos: samplePhotos);
      final mockNav = MockNavService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(mockRepo),
            navigationServiceProvider.overrideWithValue(mockNav),
          ],
          child: MaterialApp(
            theme: AppTheme.lightTheme,
            home: Scaffold(
              body: ParkingDetailsSheet(
                location: testLocation,
                distanceMeters: 450,
                onClose: () {},
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Photo gallery is embedded
      expect(find.byType(ParkingPhotoGallery), findsOneWidget);
      expect(find.text('1 / 2'), findsOneWidget);

      // Verify facility details are present
      expect(find.text('Grand Central Parking'), findsOneWidget);
      expect(find.text('Residency Road, Srinagar'), findsOneWidget);
      expect(find.text('450 m away (straight-line)'), findsOneWidget);

      // Verify Save button is present and interactive
      final bookmarkFinder = find.byTooltip('Save parking');
      expect(bookmarkFinder, findsOneWidget);
      await tester.tap(bookmarkFinder);
      await tester.pumpAndSettle();

      // Dismiss auth prompt if guest modal appears
      if (find.text('Continue as Guest').evaluate().isNotEmpty) {
        await tester.tap(find.text('Continue as Guest'));
        await tester.pumpAndSettle();
      }

      // Verify Directions button is present and fires navigation
      final directionsButton = find.text('Directions');
      expect(directionsButton, findsOneWidget);
      await tester.tap(directionsButton);
      await tester.pumpAndSettle();
      expect(mockNav.wasLaunched, isTrue);
    });

    testWidgets('renders cleanly in dark theme and on compact small-screen devices', (tester) async {
      final mockRepo = MockParkingRepositoryForPhotos(photos: samplePhotos);

      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingRepositoryProvider.overrideWithValue(mockRepo),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: Scaffold(
              body: ParkingDetailsSheet(
                location: testLocation,
                onClose: () {},
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify no RenderFlex overflow occurs
      expect(tester.takeException(), isNull);
      expect(find.text('Grand Central Parking'), findsOneWidget);
    });
  });
}
