/// Autocomplete prediction suggestion for destination search.
class DestinationSuggestion {
  const DestinationSuggestion({
    required this.placeId,
    required this.text,
    required this.primaryText,
    required this.secondaryText,
  });

  final String placeId;
  final String text;
  final String primaryText;
  final String secondaryText;

  factory DestinationSuggestion.fromJson(Map<String, dynamic> json) {
    return DestinationSuggestion(
      placeId: json['placeId']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      primaryText: json['primaryText']?.toString() ?? '',
      secondaryText: json['secondaryText']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'placeId': placeId,
      'text': text,
      'primaryText': primaryText,
      'secondaryText': secondaryText,
    };
  }
}

/// Geographic coordinates and metadata of a resolved destination.
class ResolvedDestination {
  const ResolvedDestination({
    required this.placeId,
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String placeId;
  final String name;
  final String address;
  final double latitude;
  final double longitude;

  factory ResolvedDestination.fromJson(Map<String, dynamic> json) {
    return ResolvedDestination(
      placeId: json['placeId']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Destination',
      address: json['address']?.toString() ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0.0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'placeId': placeId,
      'name': name,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
    };
  }
}

/// Origin mode defining the source of the active parking search center.
enum SearchOriginType {
  /// GPS / device location
  currentLocation,

  /// Explicit map pan and "Search This Area" action
  selectedMapArea,

  /// Destination search (e.g. Connaught Place)
  destination,
}
