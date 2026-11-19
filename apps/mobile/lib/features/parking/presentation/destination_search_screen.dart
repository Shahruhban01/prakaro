import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/components/prakaro_button.dart';
import '../../../core/design/components/prakaro_loading.dart';
import '../../../core/design/prakaro_icons.dart';
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
    final isDark = theme.brightness == Brightness.dark;
    final searchState = ref.watch(destinationSearchProvider);

    return Scaffold(
      backgroundColor: isDark ? AppTheme.canvasDark : Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // Custom Top Bar with Back Button and Sleek Search Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.surfaceCardDark : Colors.white,
                border: Border(
                  bottom: BorderSide(
                    color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                    width: 1.0,
                  ),
                ),
              ),
              child: Row(
                children: [
                  PrakaroIconButton(
                    icon: PrakaroIconData.arrowBack,
                    tooltip: 'Back',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF191D24) : const Color(0xFFF4F6F8),
                        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                        border: Border.all(
                          color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
                          width: 1.0,
                        ),
                      ),
                      child: Row(
                        children: [
                          PrakaroIcon(
                            PrakaroIconData.search,
                            size: 18,
                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextField(
                              controller: _textController,
                              focusNode: _focusNode,
                              textInputAction: TextInputAction.search,
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                              ),
                              decoration: InputDecoration(
                                hintText: 'Search destination or address...',
                                hintStyle: TextStyle(
                                  fontSize: 14,
                                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                                ),
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: EdgeInsets.zero,
                              ),
                              onChanged: (val) {
                                ref.read(destinationSearchProvider.notifier).onQueryChanged(val);
                              },
                            ),
                          ),
                          if (_textController.text.isNotEmpty)
                            PrakaroIconButton(
                              icon: PrakaroIconData.close,
                              size: 26,
                              iconSize: 12,
                              tooltip: 'Clear',
                              onPressed: () {
                                _textController.clear();
                                ref.read(destinationSearchProvider.notifier).onQueryChanged('');
                              },
                            ),
                          if (searchState.isLoading || searchState.isResolving) ...[
                            const SizedBox(width: 6),
                            const PrakaroLoadingIndicator(size: 16, strokeWidth: 2.0),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Error banner if any
            if (searchState.errorMessage != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                color: isDark ? const Color(0xFF2E1919) : const Color(0xFFFEF2F2),
                child: Row(
                  children: [
                    const PrakaroIcon(
                      PrakaroIconData.info,
                      color: Color(0xFFDC2626),
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        searchState.errorMessage!,
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark ? const Color(0xFFFCA5A5) : const Color(0xFF991B1B),
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
    final isDark = theme.brightness == Brightness.dark;
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      children: [
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E232E) : const Color(0xFFF1F3F6),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: PrakaroIcon(
              PrakaroIconData.search,
              size: 28,
              color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Find Parking at Your Destination',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Enter any landmark, office, mall, or street address to discover nearby parking before you drive.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14,
            height: 1.4,
            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
          ),
        ),
      ],
    );
  }

  Widget _buildSuggestionsList(ThemeData theme, DestinationSearchState searchState) {
    final isDark = theme.brightness == Brightness.dark;
    if (searchState.suggestions.isEmpty && !searchState.isLoading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              PrakaroIcon(
                PrakaroIconData.locationPin,
                size: 38,
                color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
              ),
              const SizedBox(height: 14),
              Text(
                'No destinations found',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Try a different landmark or street name',
                style: TextStyle(
                  fontSize: 13,
                  color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      itemCount: searchState.suggestions.length,
      separatorBuilder: (_, _) => Divider(
        height: 1,
        indent: 64,
        color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
      ),
      itemBuilder: (context, index) {
        final suggestion = searchState.suggestions[index];

        return InkWell(
          onTap: searchState.isResolving ? null : () => _selectSuggestion(suggestion),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.canvasDark : AppTheme.accentSoftLight,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: const PrakaroIcon(
                    PrakaroIconData.locationPin,
                    size: 18,
                    color: AppTheme.primaryBlue,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        suggestion.primaryText.isNotEmpty ? suggestion.primaryText : suggestion.text,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: isDark ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLight,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (suggestion.secondaryText.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          suggestion.secondaryText,
                          style: TextStyle(
                            fontSize: 13,
                            color: isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildGoogleAttribution(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceCardDark : const Color(0xFFF9FAFC),
        border: Border(
          top: BorderSide(
            color: isDark ? AppTheme.borderDark : AppTheme.borderLight,
            width: 1.0,
          ),
        ),
      ),
      child: Center(
        child: Text(
          'Powered by Google',
          style: TextStyle(
            fontSize: 11,
            color: isDark
                ? AppTheme.textSecondaryDark.withValues(alpha: 0.7)
                : AppTheme.textSecondaryLight.withValues(alpha: 0.7),
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
