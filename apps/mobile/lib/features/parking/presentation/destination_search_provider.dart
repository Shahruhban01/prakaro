import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/places_remote_data_source.dart';
import '../domain/destination_search_models.dart';

/// State of the destination search workflow.
class DestinationSearchState {
  const DestinationSearchState({
    this.query = '',
    this.sessionToken = '',
    this.suggestions = const [],
    this.isLoading = false,
    this.isResolving = false,
    this.errorMessage,
    this.activeDestination,
    this.originType = SearchOriginType.currentLocation,
  });

  final String query;
  final String sessionToken;
  final List<DestinationSuggestion> suggestions;
  final bool isLoading;
  final bool isResolving;
  final String? errorMessage;
  final ResolvedDestination? activeDestination;
  final SearchOriginType originType;

  bool get hasActiveDestination =>
      originType == SearchOriginType.destination && activeDestination != null;

  DestinationSearchState copyWith({
    String? query,
    String? sessionToken,
    List<DestinationSuggestion>? suggestions,
    bool? isLoading,
    bool? isResolving,
    String? errorMessage,
    ResolvedDestination? activeDestination,
    SearchOriginType? originType,
    bool clearActiveDestination = false,
    bool clearError = false,
  }) {
    return DestinationSearchState(
      query: query ?? this.query,
      sessionToken: sessionToken ?? this.sessionToken,
      suggestions: suggestions ?? this.suggestions,
      isLoading: isLoading ?? this.isLoading,
      isResolving: isResolving ?? this.isResolving,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      activeDestination: clearActiveDestination
          ? null
          : (activeDestination ?? this.activeDestination),
      originType: originType ?? this.originType,
    );
  }
}

/// Provider managing destination search state, debouncing, and session token lifecycle.
final destinationSearchProvider =
    NotifierProvider<DestinationSearchNotifier, DestinationSearchState>(
  DestinationSearchNotifier.new,
);

class DestinationSearchNotifier extends Notifier<DestinationSearchState> {
  PlacesRemoteDataSource get _placesSource => ref.read(placesRemoteDataSourceProvider);

  Timer? _debounceTimer;
  CancelToken? _cancelToken;
  static const _uuid = Uuid();

  @override
  DestinationSearchState build() {
    return DestinationSearchState(sessionToken: _uuid.v4());
  }

  /// Start a new autocomplete session with a fresh session token.
  void startNewSession() {
    _debounceTimer?.cancel();
    _cancelToken?.cancel();
    state = state.copyWith(
      query: '',
      suggestions: const [],
      isLoading: false,
      isResolving: false,
      sessionToken: _uuid.v4(),
      clearError: true,
    );
  }

  /// Handle search query text changes with 400ms debounce and request cancellation.
  void onQueryChanged(String query) {
    _debounceTimer?.cancel();
    state = state.copyWith(query: query, clearError: true);

    final trimmed = query.trim();
    if (trimmed.length < 2) {
      _cancelToken?.cancel();
      state = state.copyWith(suggestions: const [], isLoading: false);
      return;
    }

    _debounceTimer = Timer(const Duration(milliseconds: 400), () {
      _fetchSuggestions(trimmed);
    });
  }

  Future<void> _fetchSuggestions(String input) async {
    _cancelToken?.cancel();
    _cancelToken = CancelToken();

    // Ensure session token exists
    if (state.sessionToken.isEmpty) {
      state = state.copyWith(sessionToken: _uuid.v4());
    }

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      final results = await _placesSource.getAutocompleteSuggestions(
        input: input,
        sessionToken: state.sessionToken,
        cancelToken: _cancelToken,
      );

      state = state.copyWith(
        suggestions: results,
        isLoading: false,
      );
    } catch (e) {
      if (e is DioException && e.type == DioExceptionType.cancel) {
        return; // Request was superseded
      }
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to load destination suggestions. Check connection.',
      );
    }
  }

  /// Resolve the selected destination placeId to geographic coordinates and conclude the session.
  Future<ResolvedDestination?> resolveSelection(DestinationSuggestion suggestion) async {
    _debounceTimer?.cancel();
    _cancelToken?.cancel();

    state = state.copyWith(isResolving: true, clearError: true);

    try {
      final resolved = await _placesSource.resolveDestination(
        placeId: suggestion.placeId,
        sessionToken: state.sessionToken,
      );

      if (resolved != null) {
        state = state.copyWith(
          isResolving: false,
          activeDestination: resolved,
          originType: SearchOriginType.destination,
          // Generate new session token for future searches to conclude billing session
          sessionToken: _uuid.v4(),
          suggestions: const [],
        );
        return resolved;
      }
    } catch (_) {
      state = state.copyWith(
        isResolving: false,
        errorMessage: 'Failed to resolve destination location.',
      );
    }

    state = state.copyWith(isResolving: false);
    return null;
  }

  /// Clear the active destination and reset the search center to user's device location.
  void clearActiveDestination() {
    state = state.copyWith(
      clearActiveDestination: true,
      originType: SearchOriginType.currentLocation,
    );
  }
}
