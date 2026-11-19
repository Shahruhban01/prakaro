import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

final locationServiceProvider = Provider<LocationService>((ref) {
  return LocationService();
});

sealed class LocationResult {
  const LocationResult();
}

class LocationSuccess extends LocationResult {
  const LocationSuccess(this.latitude, this.longitude);
  final double latitude;
  final double longitude;
}

enum LocationFailureReason {
  serviceDisabled,
  permissionDenied,
  permissionPermanentlyDenied,
  timeout,
  unknown,
}

class LocationFailure extends LocationResult {
  const LocationFailure(this.reason, this.message);
  final LocationFailureReason reason;
  final String message;
}

/// Service handling foreground GPS coordinates and permissions via Geolocator.
class LocationService {
  Future<LocationResult> getCurrentLocation() async {
    try {
      final isServiceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!isServiceEnabled) {
        return const LocationFailure(
          LocationFailureReason.serviceDisabled,
          'Location services are disabled on your device.',
        );
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return const LocationFailure(
            LocationFailureReason.permissionDenied,
            'Location permission was denied.',
          );
        }
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationFailure(
          LocationFailureReason.permissionPermanentlyDenied,
          'Location permission is permanently denied. Please enable it in App Settings.',
        );
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );

      return LocationSuccess(position.latitude, position.longitude);
    } catch (e) {
      return LocationFailure(
        LocationFailureReason.unknown,
        'Failed to obtain location: $e',
      );
    }
  }

  Future<bool> openAppSettings() => Geolocator.openAppSettings();

  Future<bool> openLocationSettings() => Geolocator.openLocationSettings();
}
