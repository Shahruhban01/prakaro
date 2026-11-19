import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:prakaro/features/auth/domain/auth_state.dart';
import 'package:prakaro/features/auth/domain/user.dart';
import 'package:prakaro/features/auth/presentation/providers/auth_providers.dart';
import 'package:prakaro/features/auth/presentation/screens/login_screen.dart';
import 'package:prakaro/features/auth/presentation/screens/profile_screen.dart';
import 'package:prakaro/features/auth/presentation/screens/register_screen.dart';
import 'package:prakaro/features/auth/presentation/widgets/auth_prompt_bottom_sheet.dart';
import 'package:prakaro/features/parking/domain/destination_search_models.dart';
import 'package:prakaro/features/parking/presentation/destination_search_provider.dart';
import 'package:prakaro/features/parking/presentation/destination_search_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Milestone 10: Domain Models & Serialization', () {
    test('AppUser parses from Better Auth JSON payload', () {
      final json = {
        'id': 'user_abc123',
        'name': 'Prakaro Driver',
        'email': 'driver@prakaro.com',
        'emailVerified': true,
        'image': 'https://prakaro.com/avatar.png',
        'createdAt': '2026-11-19T10:00:00.000Z',
      };

      final user = AppUser.fromJson(json);
      expect(user.id, 'user_abc123');
      expect(user.name, 'Prakaro Driver');
      expect(user.email, 'driver@prakaro.com');
      expect(user.emailVerified, isTrue);
      expect(user.image, 'https://prakaro.com/avatar.png');
      expect(user.createdAt, isNotNull);

      final serialized = user.toJson();
      expect(serialized['id'], 'user_abc123');
      expect(serialized['email'], 'driver@prakaro.com');
    });

    test('UserPreferences defaults to privacy-first settings (search history disabled)', () {
      const prefs = UserPreferences();
      expect(prefs.recentSearchEnabled, isFalse);
      expect(prefs.defaultRadiusMeters, 3000);

      final custom = UserPreferences.fromJson({
        'recentSearchEnabled': true,
        'defaultRadiusMeters': 5000,
      });
      expect(custom.recentSearchEnabled, isTrue);
      expect(custom.defaultRadiusMeters, 5000);
    });

    test('DestinationSuggestion and ResolvedDestination parse and serialize accurately', () {
      final suggestion = DestinationSuggestion.fromJson({
        'placeId': 'ChIJdest123',
        'text': 'Connaught Place, New Delhi, India',
        'primaryText': 'Connaught Place',
        'secondaryText': 'New Delhi, India',
      });

      expect(suggestion.placeId, 'ChIJdest123');
      expect(suggestion.primaryText, 'Connaught Place');
      expect(suggestion.secondaryText, 'New Delhi, India');

      final resolved = ResolvedDestination.fromJson({
        'placeId': 'ChIJdest123',
        'name': 'Connaught Place',
        'address': 'Connaught Place, New Delhi, Delhi 110001, India',
        'latitude': 28.6315,
        'longitude': 77.2167,
      });

      expect(resolved.placeId, 'ChIJdest123');
      expect(resolved.name, 'Connaught Place');
      expect(resolved.latitude, 28.6315);
      expect(resolved.longitude, 77.2167);
    });

    test('SearchOriginType enum supports all three discovery modes', () {
      expect(SearchOriginType.values, contains(SearchOriginType.currentLocation));
      expect(SearchOriginType.values, contains(SearchOriginType.selectedMapArea));
      expect(SearchOriginType.values, contains(SearchOriginType.destination));
    });
  });

  group('Milestone 10: Auth State & Destination Search Provider Logic', () {
    test('Initial AuthState is unauthenticated and identified as guest', () {
      const state = AuthState();
      expect(state.isGuest, isTrue);
      expect(state.isAuthenticated, isFalse);
      expect(state.user, isNull);
      expect(state.token, isNull);
    });

    test('AuthState with valid user and token is identified as authenticated', () {
      const user = AppUser(
        id: 'usr_1',
        name: 'Sarah Connor',
        email: 'sarah@prakaro.com',
      );
      final state = const AuthState().copyWith(
        status: AuthStatus.authenticated,
        user: user,
        token: 'bearer-token-xyz',
      );

      expect(state.isAuthenticated, isTrue);
      expect(state.isGuest, isFalse);
      expect(state.user?.name, 'Sarah Connor');
    });

    test('DestinationSearchState starts fresh session with UUID v4 token in ProviderContainer', () {
      final container = ProviderContainer();
      final initialState = container.read(destinationSearchProvider);

      expect(initialState.sessionToken, isNotEmpty);
      expect(initialState.originType, SearchOriginType.currentLocation);
      expect(initialState.hasActiveDestination, isFalse);

      container.read(destinationSearchProvider.notifier).clearActiveDestination();
      final afterClear = container.read(destinationSearchProvider);
      expect(afterClear.activeDestination, isNull);
      expect(afterClear.originType, SearchOriginType.currentLocation);
      container.dispose();
    });
  });

  group('Milestone 10: Widget Tests — Authentication & Account Screens', () {
    testWidgets('LoginScreen renders email, password, and sign in actions', (tester) async {
      final container = ProviderContainer(
        overrides: [
          authProvider.overrideWith(() => _MockAuthNotifier(
                const AuthState(status: AuthStatus.unauthenticated),
              )),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sign In'), findsAtLeast(1));
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2)); // Email & Password
      expect(find.text('Email Address'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Continue as Guest'), findsOneWidget);
      expect(find.text('Sign Up'), findsOneWidget);

      // Validate on empty submit
      await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
      await tester.pumpAndSettle();

      expect(find.text('Email address is required'), findsOneWidget);
      container.dispose();
    });

    testWidgets('RegisterScreen renders full name, email, password, and confirm password', (tester) async {
      final container = ProviderContainer(
        overrides: [
          authProvider.overrideWith(() => _MockAuthNotifier(
                const AuthState(status: AuthStatus.unauthenticated),
              )),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: RegisterScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Account'), findsAtLeast(1));
      expect(find.text('Get started with Prakaro'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(4));
      expect(find.text('Full Name'), findsOneWidget);
      expect(find.text('Confirm Password'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);

      // Empty submission validation
      await tester.tap(find.widgetWithText(FilledButton, 'Create Account'));
      await tester.pumpAndSettle();

      expect(find.text('Full name is required'), findsOneWidget);
      container.dispose();
    });

    testWidgets('ProfileScreen renders Guest Mode view when unauthenticated', (tester) async {
      final container = ProviderContainer(
        overrides: [
          authProvider.overrideWith(() => _MockAuthNotifier(
                const AuthState(status: AuthStatus.unauthenticated),
              )),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: ProfileScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Account'), findsOneWidget);
      expect(find.text('Guest Mode'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Create Free Account'), findsOneWidget);
      container.dispose();
    });

    testWidgets('ProfileScreen renders Authenticated user view with Cloud Sync Active badge', (tester) async {
      final container = ProviderContainer(
        overrides: [
          authProvider.overrideWith(() => _MockAuthNotifier(
                const AuthState(
                  status: AuthStatus.authenticated,
                  user: AppUser(
                    id: 'u_100',
                    name: 'Alex Mercer',
                    email: 'alex@prakaro.com',
                  ),
                  token: 'test-token',
                  preferences: UserPreferences(recentSearchEnabled: true, defaultRadiusMeters: 5000),
                ),
              )),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: ProfileScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Alex Mercer'), findsOneWidget);
      expect(find.text('alex@prakaro.com'), findsOneWidget);
      expect(find.text('Cloud Sync Active'), findsOneWidget);
      expect(find.text('Saved Parking Spots'), findsOneWidget);
      expect(find.text('Sync Recent Searches'), findsOneWidget);
      expect(find.text('Sign Out'), findsOneWidget);
      expect(find.text('Delete Account'), findsOneWidget);
      container.dispose();
    });

    testWidgets('AuthPromptBottomSheet renders sign in, register, and dismiss options', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (ctx) => ElevatedButton(
                onPressed: () => AuthPromptBottomSheet.show(
                  ctx,
                  facilityName: 'Central City Parking',
                ),
                child: const Text('Open Prompt'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Open Prompt'));
      await tester.pumpAndSettle();

      expect(find.text('Sign in to save parking'), findsOneWidget);
      expect(find.text('Central City Parking'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Create Account'), findsOneWidget);
      expect(find.text('Continue as Guest'), findsOneWidget);

      // Dismiss modal by continuing as guest
      await tester.tap(find.text('Continue as Guest'));
      await tester.pumpAndSettle();

      expect(find.text('Sign in to save parking'), findsNothing);
    });
  });

  group('Milestone 10: Widget Tests — Destination Search Screen', () {
    testWidgets('DestinationSearchScreen renders search field, tips, and Powered by Google attribution', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: DestinationSearchScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Search destination or address...'), findsOneWidget);
      expect(find.text('Find Parking at Your Destination'), findsOneWidget);
      expect(find.text('Powered by Google'), findsOneWidget); // Strict Google attribution compliance
    });
  });
}

class _MockAuthNotifier extends AuthNotifier {
  _MockAuthNotifier(this._initial);
  final AuthState _initial;

  @override
  AuthState build() => _initial;
}
