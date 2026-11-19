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

/// Request cancellation representation (superseded search or controller disposal).
class RequestCancelledException extends AppException {
  const RequestCancelledException({
    super.message = 'The parking search was superseded or cancelled.',
    super.cause,
  });
}

/// No internet connection detected representation.
class OfflineException extends NetworkException {
  const OfflineException({
    super.message = "You're offline. Connect to the internet to search for parking.",
    super.cause,
  });
}

/// Request timeout representation.
class NetworkTimeoutException extends NetworkException {
  const NetworkTimeoutException({
    super.message = 'This search is taking longer than expected.',
    super.statusCode = 408,
    super.cause,
  });
}

/// Rate limit exceeded representation.
class RateLimitException extends NetworkException {
  const RateLimitException({
    super.message = 'Too many searches. Please wait a moment.',
    super.statusCode = 429,
    super.cause,
  });
}

/// Resource not found representation (e.g. 404 for deleted or non-existent place).
class NotFoundException extends NetworkException {
  const NotFoundException({
    super.message = 'The requested facility was not found.',
    super.statusCode = 404,
    super.cause,
  });
}

/// Upstream Google Places or backend server failure representation.
class UpstreamServiceException extends NetworkException {
  const UpstreamServiceException({
    super.message = 'Parking search is temporarily unavailable.',
    super.statusCode = 502,
    super.cause,
  });
}
