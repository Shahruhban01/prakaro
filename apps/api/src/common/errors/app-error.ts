export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid query parameters.', details?: unknown) {
    super(400, 'INVALID_QUERY_PARAMS', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
    this.name = 'NotFoundError';
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Unable to retrieve nearby parking locations.', details?: unknown) {
    super(502, 'UPSTREAM_ERROR', message, details);
    this.name = 'UpstreamError';
  }
}

export class UpstreamTimeoutError extends AppError {
  constructor(message = 'Google Places request timed out.', details?: unknown) {
    super(504, 'UPSTREAM_TIMEOUT', message, details);
    this.name = 'UpstreamTimeoutError';
  }
}

export class UpstreamRateLimitError extends AppError {
  constructor(message = 'Google Places rate limit exceeded. Please try again shortly.', details?: unknown) {
    super(429, 'RATE_LIMIT_EXCEEDED', message, details);
    this.name = 'UpstreamRateLimitError';
  }
}

export class ConfigurationError extends AppError {
  constructor(
    message = 'Parking discovery service is not configured. Missing Google Places API credentials.',
    details?: unknown,
  ) {
    super(503, 'CONFIGURATION_ERROR', message, details);
    this.name = 'ConfigurationError';
  }
}
