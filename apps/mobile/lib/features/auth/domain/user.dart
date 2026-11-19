/// Domain model representing an authenticated user from Better Auth.
class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    this.emailVerified = false,
    this.image,
    this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final bool emailVerified;
  final String? image;
  final DateTime? createdAt;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Driver',
      email: json['email']?.toString() ?? '',
      emailVerified: json['emailVerified'] == true,
      image: json['image']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'emailVerified': emailVerified,
      'image': image,
      'createdAt': createdAt?.toIso8601String(),
    };
  }

  AppUser copyWith({
    String? id,
    String? name,
    String? email,
    bool? emailVerified,
    String? image,
    DateTime? createdAt,
  }) {
    return AppUser(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      emailVerified: emailVerified ?? this.emailVerified,
      image: image ?? this.image,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

/// Domain model representing user-configurable preferences.
class UserPreferences {
  const UserPreferences({
    this.recentSearchEnabled = false,
    this.defaultRadiusMeters = 3000,
  });

  /// Privacy-first flag controlling whether user recent searches are recorded in the cloud.
  final bool recentSearchEnabled;

  /// Default search radius in meters (1000, 3000, 5000).
  final int defaultRadiusMeters;

  factory UserPreferences.fromJson(Map<String, dynamic> json) {
    return UserPreferences(
      recentSearchEnabled: json['recentSearchEnabled'] == true,
      defaultRadiusMeters: json['defaultRadiusMeters'] is int
          ? json['defaultRadiusMeters'] as int
          : int.tryParse(json['defaultRadiusMeters']?.toString() ?? '3000') ?? 3000,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'recentSearchEnabled': recentSearchEnabled,
      'defaultRadiusMeters': defaultRadiusMeters,
    };
  }

  UserPreferences copyWith({
    bool? recentSearchEnabled,
    int? defaultRadiusMeters,
  }) {
    return UserPreferences(
      recentSearchEnabled: recentSearchEnabled ?? this.recentSearchEnabled,
      defaultRadiusMeters: defaultRadiusMeters ?? this.defaultRadiusMeters,
    );
  }
}
