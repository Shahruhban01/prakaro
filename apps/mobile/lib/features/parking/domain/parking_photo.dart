import 'package:flutter/foundation.dart';

/// Attribution metadata for an author/contributor of a parking photograph.
@immutable
class PhotoAttribution {
  const PhotoAttribution({
    required this.displayName,
    this.uri,
  });

  final String displayName;
  final String? uri;

  factory PhotoAttribution.fromJson(Map<String, dynamic> json) {
    return PhotoAttribution(
      displayName: (json['displayName'] as String?)?.trim() ?? 'Photo Contributor',
      uri: json['uri'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'displayName': displayName,
    if (uri != null) 'uri': uri,
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PhotoAttribution &&
          runtimeType == other.runtimeType &&
          displayName == other.displayName &&
          uri == other.uri;

  @override
  int get hashCode => displayName.hashCode ^ uri.hashCode;
}

/// Domain entity representing a verified photograph for a parking facility.
@immutable
class ParkingPhoto {
  const ParkingPhoto({
    required this.id,
    this.width,
    this.height,
    required this.source,
    required this.mediaUrl,
    this.attributions = const [],
  });

  final String id;
  final int? width;
  final int? height;
  final String source;
  final String mediaUrl;
  final List<PhotoAttribution> attributions;

  factory ParkingPhoto.fromJson(Map<String, dynamic> json) {
    final rawAttributions = json['attributions'] as List<dynamic>? ?? const [];
    final attributions = rawAttributions
        .map((a) => PhotoAttribution.fromJson(a as Map<String, dynamic>))
        .toList();

    return ParkingPhoto(
      id: json['id']?.toString() ?? '0',
      width: json['width'] as int?,
      height: json['height'] as int?,
      source: (json['source'] as String?) ?? 'google',
      mediaUrl: (json['mediaUrl'] as String?) ?? '',
      attributions: attributions,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (width != null) 'width': width,
    if (height != null) 'height': height,
    'source': source,
    'mediaUrl': mediaUrl,
    'attributions': attributions.map((a) => a.toJson()).toList(),
  };

  /// Constructs an absolute URL using the provided base URL and optional dimension bounds.
  String resolvedMediaUrl(String baseUrl, {int? maxWidth, int? maxHeight}) {
    String url;
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      url = mediaUrl;
    } else {
      final cleanBase = baseUrl.endsWith('/')
          ? baseUrl.substring(0, baseUrl.length - 1)
          : baseUrl;
      final cleanPath = mediaUrl.startsWith('/') ? mediaUrl : '/$mediaUrl';
      url = '$cleanBase$cleanPath';
    }

    final queryParams = <String>[];
    if (maxWidth != null) queryParams.add('maxWidth=$maxWidth');
    if (maxHeight != null) queryParams.add('maxHeight=$maxHeight');

    if (queryParams.isNotEmpty) {
      final separator = url.contains('?') ? '&' : '?';
      url = '$url$separator${queryParams.join('&')}';
    }

    return url;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ParkingPhoto &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          mediaUrl == other.mediaUrl &&
          source == other.source;

  @override
  int get hashCode => id.hashCode ^ mediaUrl.hashCode ^ source.hashCode;
}
