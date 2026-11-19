import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

final navigationServiceProvider = Provider<NavigationService>((ref) {
  return NavigationService();
});

/// Service for delegating navigation and driving directions to external map applications.
class NavigationService {
  /// Opens external Google Maps directions targeting the given coordinates.
  Future<bool> openDirections({
    required double destinationLatitude,
    required double destinationLongitude,
    String? destinationLabel,
  }) async {
    // 1. Try Google Maps navigation intent
    final googleNavUri = Uri.parse(
      'google.navigation:q=$destinationLatitude,$destinationLongitude',
    );

    if (await canLaunchUrl(googleNavUri)) {
      return launchUrl(googleNavUri);
    }

    // 2. Try standard geo intent
    final labelSuffix = destinationLabel != null && destinationLabel.isNotEmpty
        ? '(${Uri.encodeComponent(destinationLabel)})'
        : '';
    final geoUri = Uri.parse(
      'geo:$destinationLatitude,$destinationLongitude?q=$destinationLatitude,$destinationLongitude$labelSuffix',
    );

    if (await canLaunchUrl(geoUri)) {
      return launchUrl(geoUri);
    }

    // 3. Fallback to universal web directions URL
    final webUri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$destinationLatitude,$destinationLongitude',
    );

    if (await canLaunchUrl(webUri)) {
      return launchUrl(webUri, mode: LaunchMode.externalApplication);
    }

    return false;
  }
}
