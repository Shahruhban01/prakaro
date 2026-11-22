import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/core/theme/app_theme.dart';
import 'package:prakaro/features/parking/domain/parking_location.dart';
import 'package:prakaro/features/parking/presentation/parking_photos_provider.dart';
import 'package:prakaro/features/parking/presentation/parking_providers.dart';
import 'package:prakaro/features/parking/presentation/widgets/parking_details_sheet.dart';
import 'package:prakaro/features/parking/presentation/widgets/report_parking_bottom_sheet.dart';

void main() {
  group('ReportParkingBottomSheet widget tests', () {
    const testLocation = ParkingLocation(
      id: 'google:place_abc123',
      name: 'City Center Plaza Parking',
      latitude: 34.0837,
      longitude: 74.7973,
      address: 'Main Commercial Hub',
      source: 'GOOGLE_PLACES',
    );

    testWidgets('renders all problem categories and input field', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportParkingProvider.overrideWithValue(
              ({required String placeId, required String category, String? notes}) async => true,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.lightTheme,
            home: const Scaffold(
              body: ReportParkingBottomSheet(facility: testLocation),
            ),
          ),
        ),
      );

      expect(find.text('Report Parking Issue'), findsOneWidget);
      expect(find.text('City Center Plaza Parking'), findsOneWidget);
      expect(find.text('What issue did you encounter with this facility?'), findsOneWidget);
      expect(find.text('Not a parking lot'), findsOneWidget);
      expect(find.text('Private or restricted access'), findsOneWidget);
      expect(find.text('Incorrect pin or location'), findsOneWidget);
      expect(find.text('Wrong pricing info'), findsOneWidget);
      expect(find.text('Incorrect hours'), findsOneWidget);
      expect(find.text('Permanently closed'), findsOneWidget);
      expect(find.text('Other problem'), findsOneWidget);
      expect(find.text('Additional details (optional)'), findsOneWidget);
      expect(find.text('Submit Report'), findsOneWidget);
    });

    testWidgets('shows validation message if submitted without selecting a category', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportParkingProvider.overrideWithValue(
              ({required String placeId, required String category, String? notes}) async => true,
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.lightTheme,
            home: const Scaffold(
              body: ReportParkingBottomSheet(facility: testLocation),
            ),
          ),
        ),
      );

      // Tap Submit without category selection
      await tester.tap(find.text('Submit Report'));
      await tester.pump();

      expect(find.text('Please select a reason for this report.'), findsOneWidget);
    });

    testWidgets('submits report with selected category and custom notes', (tester) async {
      String? submittedPlaceId;
      String? submittedCategory;
      String? submittedNotes;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            reportParkingProvider.overrideWithValue(
              ({required String placeId, required String category, String? notes}) async {
                submittedPlaceId = placeId;
                submittedCategory = category;
                submittedNotes = notes;
                return true;
              },
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.lightTheme,
            home: const Scaffold(
              body: ReportParkingBottomSheet(facility: testLocation),
            ),
          ),
        ),
      );

      // Select 'Incorrect hours'
      await tester.tap(find.text('Incorrect hours'));
      await tester.pump();

      // Enter notes
      await tester.enterText(
        find.byType(TextField),
        'Gate was locked at 8 PM instead of midnight.',
      );
      await tester.pump();

      // Tap Submit
      await tester.tap(find.text('Submit Report'));
      await tester.pumpAndSettle();

      expect(submittedPlaceId, 'google:place_abc123');
      expect(submittedCategory, 'HOURS');
      expect(submittedNotes, 'Gate was locked at 8 PM instead of midnight.');
    });

    testWidgets('ParkingDetailsSheet contains Report incorrect information trigger', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            parkingPhotosProvider('google:place_abc123').overrideWith((ref) => Future.value(const [])),
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

      expect(find.text('Report incorrect information'), findsOneWidget);
    });
  });
}
