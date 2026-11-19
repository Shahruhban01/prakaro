import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/app/app.dart';
import 'package:prakaro/features/splash/presentation/splash_screen.dart';

void main() {
  group('Prakaro Splash Screen', () {
    testWidgets('renders brand emblem, wordmark, and tagline', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: SplashScreen(
              minDisplayDuration: Duration(seconds: 10),
            ),
          ),
        ),
      );

      // Verify tagline text exists
      expect(find.text('SMART PARKING DISCOVERY'), findsOneWidget);

      // Verify background scaffold exists
      expect(find.byType(Scaffold), findsOneWidget);

      // Pump animation forward
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('SMART PARKING DISCOVERY'), findsOneWidget);
    });

    testWidgets('transitions to custom nextScreen after minDisplayDuration', (tester) async {
      const dummyDestination = Scaffold(
        body: Center(child: Text('Main Content Ready')),
      );

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: SplashScreen(
              minDisplayDuration: Duration(milliseconds: 50),
              nextScreen: dummyDestination,
            ),
          ),
        ),
      );

      expect(find.text('SMART PARKING DISCOVERY'), findsOneWidget);
      expect(find.text('Main Content Ready'), findsNothing);

      // Advance clock past minDisplayDuration and transition
      await tester.pump(const Duration(milliseconds: 60));
      await tester.pumpAndSettle();

      expect(find.text('Main Content Ready'), findsOneWidget);
    });

    testWidgets('tap gesture triggers immediate transition to nextScreen', (tester) async {
      const dummyDestination = Scaffold(
        body: Center(child: Text('Quick Skip Landed')),
      );

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: SplashScreen(
              minDisplayDuration: Duration(seconds: 10),
              nextScreen: dummyDestination,
            ),
          ),
        ),
      );

      expect(find.text('Quick Skip Landed'), findsNothing);

      // Tap on the splash screen to skip
      await tester.tap(find.byType(GestureDetector));
      await tester.pumpAndSettle();

      expect(find.text('Quick Skip Landed'), findsOneWidget);
    });

    testWidgets('PrakaroApp boots with initialHome or SplashScreen', (tester) async {
      const customScreen = Scaffold(
        body: Center(child: Text('Direct Test Harness View')),
      );

      await tester.pumpWidget(
        const ProviderScope(
          child: PrakaroApp(initialHome: customScreen),
        ),
      );

      expect(find.text('Direct Test Harness View'), findsOneWidget);
    });
  });
}
