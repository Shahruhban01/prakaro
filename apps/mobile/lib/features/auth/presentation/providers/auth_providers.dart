import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/auth_repository.dart';
import '../../domain/auth_state.dart';

/// Provider exposing the current [AuthState].
final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

/// Notifier managing authentication state and actions.
class AuthNotifier extends Notifier<AuthState> {
  AuthRepository get _repository => ref.read(authRepositoryProvider);

  @override
  AuthState build() {
    // Check active session on startup asynchronously if mounted
    Future.microtask(() {
      if (ref.mounted) {
        checkSession();
      }
    });
    return const AuthState(status: AuthStatus.initial);
  }

  /// Check whether a valid saved session exists.
  Future<void> checkSession() async {
    if (!ref.mounted) return;
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final result = await _repository.checkSession();
      if (!ref.mounted) return;
      if (result.user != null && result.token != null) {
        state = state.copyWith(
          status: AuthStatus.authenticated,
          user: result.user,
          token: result.token,
          preferences: result.preferences,
          clearError: true,
        );
      } else {
        state = state.copyWith(
          status: AuthStatus.unauthenticated,
          clearError: true,
        );
      }
    } catch (_) {
      if (!ref.mounted) return;
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        clearError: true,
      );
    }
  }

  /// Sign up with name, email, and password.
  Future<bool> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    state = state.copyWith(status: AuthStatus.loading, clearError: true);
    try {
      final result = await _repository.signUp(
        name: name,
        email: email,
        password: password,
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: result.user,
        token: result.token,
        preferences: result.preferences,
        clearError: true,
      );
      return true;
    } catch (e) {
      final message = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: message,
      );
      return false;
    }
  }

  /// Sign in with email and password.
  Future<bool> signIn({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(status: AuthStatus.loading, clearError: true);
    try {
      final result = await _repository.signIn(
        email: email,
        password: password,
      );
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: result.user,
        token: result.token,
        preferences: result.preferences,
        clearError: true,
      );
      return true;
    } catch (e) {
      final message = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: message,
      );
      return false;
    }
  }

  /// Sign out current user.
  Future<void> signOut() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      await _repository.signOut();
    } catch (_) {}
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Update user preferences (e.g. recentSearchEnabled or defaultRadiusMeters).
  Future<bool> updatePreferences({
    bool? recentSearchEnabled,
    int? defaultRadiusMeters,
  }) async {
    try {
      final updated = await _repository.updatePreferences(
        recentSearchEnabled: recentSearchEnabled,
        defaultRadiusMeters: defaultRadiusMeters,
      );
      state = state.copyWith(preferences: updated);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Permanently delete account and all cloud data.
  Future<bool> deleteAccount() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final success = await _repository.deleteAccount();
      if (success) {
        state = const AuthState(status: AuthStatus.unauthenticated);
        return true;
      }
    } catch (_) {}
    state = state.copyWith(
      status: AuthStatus.authenticated,
      errorMessage: 'Failed to delete account. Please try again.',
    );
    return false;
  }

  /// Clear any transient error message.
  void clearError() {
    state = state.copyWith(clearError: true);
  }
}
