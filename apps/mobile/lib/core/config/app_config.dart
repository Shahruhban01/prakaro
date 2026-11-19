/// Application environment configuration.
///
/// Networking values are configurable at compile time using Dart environment defines:
/// `--dart-define=API_BASE_URL=http://...`
///
/// Network default guidance:
/// - Android Emulator: 'http://10.0.2.2:3000' (maps to host localhost)
/// - Physical Android Device: `http://<HOST_MACHINE_LAN_IP>:3000`
/// - Desktop / Web: 'http://localhost:3000'
class AppConfig {
  AppConfig._();

  static const String appName = 'Prakaro';
  static const String appTagline = 'Parking discovery, simplified.';
  static const String appStatus = 'MVP development environment ready';

  /// Base URL for Prakaro Backend API service.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 10);
}
