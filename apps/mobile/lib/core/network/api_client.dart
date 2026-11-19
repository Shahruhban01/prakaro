import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../errors/app_exception.dart';

/// Provider for the singleton Dio HTTP client instance.
final apiClientProvider = Provider<ApiClient>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: const {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  return ApiClient(dio);
});

/// Dedicated API client for backend communication.
///
/// Keeps networking logic, error interception, and base URL handling outside UI widgets.
class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Dio get dio => _dio;

  /// Perform a GET request with request cancellation, transient auto-retry, and unified error translation.
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    bool enableRetry = true,
  }) async {
    int attempts = 0;
    const maxAttempts = 2; // Initial request + at most 1 bounded retry

    while (true) {
      attempts++;
      try {
        return await _dio.get<T>(
          path,
          queryParameters: queryParameters,
          options: options,
          cancelToken: cancelToken,
        );
      } on DioException catch (e) {
        final isCancel = e.type == DioExceptionType.cancel;
        final statusCode = e.response?.statusCode;
        final isNonRetryable = isCancel ||
            statusCode == 400 ||
            statusCode == 401 ||
            statusCode == 403 ||
            statusCode == 404 ||
            statusCode == 422 ||
            statusCode == 429 ||
            statusCode == 503; // Configuration error should not be retried

        if (!enableRetry || attempts >= maxAttempts || isNonRetryable) {
          throw _handleDioError(e);
        }

        // Bounded jittered backoff: ~250ms
        await Future<void>.delayed(
          Duration(milliseconds: 200 + (DateTime.now().microsecond % 100)),
        );
      } catch (e) {
        if (e is AppException) rethrow;
        throw AppException(message: 'Unexpected network error: $e', cause: e);
      }
    }
  }

  /// Perform a POST request with unified error translation.
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw AppException(message: 'Unexpected network error: $e', cause: e);
    }
  }

  AppException _handleDioError(DioException error) {
    if (error.type == DioExceptionType.cancel) {
      return RequestCancelledException(cause: error);
    }

    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return NetworkTimeoutException(cause: error);
    }

    if (error.type == DioExceptionType.connectionError) {
      return OfflineException(cause: error);
    }

    final statusCode = error.response?.statusCode;
    final dynamic responseData = error.response?.data;

    String? extractedMessage;
    if (responseData is Map<String, dynamic>) {
      if (responseData['error'] is Map<String, dynamic> &&
          responseData['error']['message'] != null) {
        extractedMessage = responseData['error']['message'].toString();
      } else if (responseData['message'] != null) {
        extractedMessage = responseData['message'].toString();
      }
    }

    if (statusCode == 429) {
      return RateLimitException(
        message: extractedMessage ?? 'Too many searches. Please wait a moment.',
        cause: error,
      );
    }

    if (statusCode == 408) {
      return NetworkTimeoutException(
        message: extractedMessage ?? 'This search is taking longer than expected.',
        cause: error,
      );
    }

    if (statusCode == 502 || statusCode == 504) {
      return UpstreamServiceException(
        message: extractedMessage ?? 'Parking search is temporarily unavailable.',
        statusCode: statusCode,
        cause: error,
      );
    }

    final message = extractedMessage ?? error.message ?? 'Network connection failure';

    return NetworkException(
      message: message,
      statusCode: statusCode,
      cause: error,
    );
  }
}
