import 'user.dart';

/// Authentication state status.
enum AuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
  error,
}

/// Authentication state model.
class AuthState {
  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.token,
    this.preferences = const UserPreferences(),
    this.errorMessage,
  });

  final AuthStatus status;
  final AppUser? user;
  final String? token;
  final UserPreferences preferences;
  final String? errorMessage;

  bool get isAuthenticated => status == AuthStatus.authenticated && user != null;
  bool get isGuest => !isAuthenticated;
  bool get isLoading => status == AuthStatus.loading;

  AuthState copyWith({
    AuthStatus? status,
    AppUser? user,
    String? token,
    UserPreferences? preferences,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      token: token ?? this.token,
      preferences: preferences ?? this.preferences,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}
