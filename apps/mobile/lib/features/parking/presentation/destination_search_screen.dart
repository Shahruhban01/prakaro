import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/destination_search_models.dart';
import 'destination_search_provider.dart';
import 'parking_providers.dart';

/// Screen allowing users to search destinations with debounced Google Places Autocomplete
/// and resolve geographic coordinates for parking discovery.
class DestinationSearchScreen extends ConsumerStatefulWidget {
  const DestinationSearchScreen({super.key});

  @override
  ConsumerState<DestinationSearchScreen> createState() =>
      _DestinationSearchScreenState();
}

class _DestinationSearchScreenState extends ConsumerState<DestinationSearchScreen> {
  final _textController = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    // Start fresh session with unique session token
    Future.microtask(() {
      if (mounted) {
        ref.read(destinationSearchProvider.notifier).startNewSession();
        _focusNode.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _selectSuggestion(DestinationSuggestion suggestion) async {
    AppHaptics.selection();
    FocusScope.of(context).unfocus();

    final resolved = await ref
        .read(destinationSearchProvider.notifier)
        .resolveSelection(suggestion);

    if (resolved != null && mounted) {
      // Direct parking discovery search around the destination
      ref.read(parkingMapProvider.notifier).searchDestination(
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            destinationName: resolved.name,
          );

      Navigator.of(context).pop(resolved);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final searchState = ref.watch(destinationSearchProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        elevation: 1,
        title: TextField(
          controller: _textController,
          focusNode: _focusNode,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search destination or address...',
            hintStyle: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
            ),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          ),
          onChanged: (val) {
            ref.read(destinationSearchProvider.notifier).onQueryChanged(val);
          },
        ),
        actions: [
          if (_textController.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear_rounded),
              tooltip: 'Clear',
              onPressed: () {
                _textController.clear();
                ref.read(destinationSearchProvider.notifier).onQueryChanged('');
              },
            ),
          if (searchState.isLoading || searchState.isResolving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Error banner if any
            if (searchState.errorMessage != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: theme.colorScheme.errorContainer,
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: theme.colorScheme.onErrorContainer, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        searchState.errorMessage!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onErrorContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // Content: Empty query instructions vs suggestions list
            Expanded(
              child: _textController.text.trim().isEmpty
                  ? _buildEmptyQueryView(theme)
                  : _buildSuggestionsList(theme, searchState),
            ),

            // Google Attribution Footer (Compliance Requirement)
            _buildGoogleAttribution(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyQueryView(ThemeData theme) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      children: [
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.search_rounded,
              size: 32,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Find Parking at Your Destination',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Enter any landmark, office, mall, or street address to discover nearby parking before you drive.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildSuggestionsList(ThemeData theme, DestinationSearchState searchState) {
    if (searchState.suggestions.isEmpty && !searchState.isLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.location_off_outlined,
              size: 40,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(
              'No destinations found',
              style: theme.textTheme.titleSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Try a different landmark or street name',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      itemCount: searchState.suggestions.length,
      separatorBuilder: (_, _) => const Divider(height: 1, indent: 56),
      itemBuilder: (context, index) {
        final suggestion = searchState.suggestions[index];

        return ListTile(
          leading: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.place_outlined,
              size: 20,
              color: theme.colorScheme.primary,
            ),
          ),
          title: Text(
            suggestion.primaryText.isNotEmpty ? suggestion.primaryText : suggestion.text,
            style: theme.textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w600,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: suggestion.secondaryText.isNotEmpty
              ? Text(
                  suggestion.secondaryText,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                )
              : null,
          onTap: searchState.isResolving ? null : () => _selectSuggestion(suggestion),
        );
      },
    );
  }

  Widget _buildGoogleAttribution(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      color: theme.colorScheme.surfaceContainerLow,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_clock_outlined, size: 14, color: theme.colorScheme.outline),
          const SizedBox(width: 6),
          Text(
            'Powered by Google',
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.outline,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
