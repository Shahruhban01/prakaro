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

  /// Perform a GET request with unified error translation.
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get<T>(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw AppException(message: 'Unexpected network error: $e', cause: e);
    }
  }

  /// Perform a POST request with unified error translation.
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw AppException(message: 'Unexpected network error: $e', cause: e);
    }
  }

  AppException _handleDioError(DioException error) {
    final statusCode = error.response?.statusCode;
    final dynamic responseData = error.response?.data;
    final message = (responseData is Map<String, dynamic> && responseData['message'] != null)
        ? responseData['message'].toString()
        : error.message ?? 'Network connection failure';

    return NetworkException(
      message: message,
      statusCode: statusCode,
      cause: error,
    );
  }
}
