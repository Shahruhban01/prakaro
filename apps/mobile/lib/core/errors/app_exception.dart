/// Application-level exception representation.
class AppException implements Exception {
  const AppException({
    required this.message,
    this.statusCode,
    this.cause,
  });

  final String message;
  final int? statusCode;
  final Object? cause;

  @override
  String toString() => 'AppException(statusCode: $statusCode, message: $message)';
}

/// Network-specific exception representation.
class NetworkException extends AppException {
  const NetworkException({
    required super.message,
    super.statusCode,
    super.cause,
  });
}
