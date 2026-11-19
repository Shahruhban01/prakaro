import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/parking_photo.dart';
import '../parking_photos_provider.dart';
import 'parking_photo_viewer_screen.dart';

/// Swipeable 16:9 photo gallery carousel embedded in the parking details sheet.
/// Complies with Google Places Photo attribution rules, provides loading skeleton,
/// graceful empty state, inline error recovery, and seamless full-screen tap-to-expand.
class ParkingPhotoGallery extends ConsumerStatefulWidget {
  const ParkingPhotoGallery({
    super.key,
    required this.parkingId,
    this.facilityName = 'Parking Facility',
  });

  final String parkingId;
  final String facilityName;

  @override
  ConsumerState<ParkingPhotoGallery> createState() => _ParkingPhotoGalleryState();
}

class _ParkingPhotoGalleryState extends ConsumerState<ParkingPhotoGallery> {
  late final PageController _pageController;
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final photosAsync = ref.watch(parkingPhotosProvider(widget.parkingId));

    if (photosAsync.hasError) {
      return _buildErrorState(theme, colorScheme);
    }

    return photosAsync.when(
      loading: () => _buildLoadingSkeleton(colorScheme),
      error: (err, _) => _buildErrorState(theme, colorScheme),
      data: (photos) {
        if (photos.isEmpty) {
          return _buildEmptyState(theme, colorScheme);
        }
        return _buildCarousel(context, photos, theme, colorScheme);
      },
    );
  }

  Widget _buildLoadingSkeleton(ColorScheme colorScheme) {
    return Container(
      height: 180,
      width: double.infinity,
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHigh,
                shape: BoxShape.circle,
              ),
              child: PrakaroIcon(
                PrakaroIconData.photo,
                size: 24,
                color: colorScheme.primary.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Loading photos...',
              style: TextStyle(
                color: colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme, ColorScheme colorScheme) {
    return Container(
      height: 120,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHigh,
                shape: BoxShape.circle,
              ),
              child: PrakaroIcon(
                PrakaroIconData.parking,
                size: 24,
                color: colorScheme.outline,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'No photos available for this parking location.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colorScheme.onSurfaceVariant,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(ThemeData theme, ColorScheme colorScheme) {
    return Container(
      height: 120,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                PrakaroIcon(
                  PrakaroIconData.info,
                  size: 18,
                  color: colorScheme.error,
                ),
                const SizedBox(width: 8),
                Text(
                  'Unable to load photos right now.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurface,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            PrakaroButton.ghost(
              label: 'Retry',
              icon: PrakaroIconData.refresh,
              size: PrakaroButtonSize.small,
              onPressed: () {
                AppHaptics.lightImpact();
                ref.invalidate(parkingPhotosProvider(widget.parkingId));
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCarousel(
    BuildContext context,
    List<ParkingPhoto> photos,
    ThemeData theme,
    ColorScheme colorScheme,
  ) {
    final validPage = (_currentPage >= 0 && _currentPage < photos.length) ? _currentPage : 0;
    final currentPhoto = photos[validPage];

    return Container(
      height: 190,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 1. Swipeable PageView of photo cards
            PageView.builder(
              controller: _pageController,
              itemCount: photos.length,
              onPageChanged: (index) {
                setState(() => _currentPage = index);
              },
              itemBuilder: (context, index) {
                final photo = photos[index];
                final thumbnailUrl = photo.resolvedMediaUrl(
                  AppConfig.apiBaseUrl,
                  maxWidth: 800,
                  maxHeight: 500,
                );

                return GestureDetector(
                  onTap: () {
                    AppHaptics.lightImpact();
                    ParkingPhotoViewerScreen.show(
                      context,
                      photos: photos,
                      initialIndex: index,
                      facilityName: widget.facilityName,
                    );
                  },
                  child: Image.network(
                    thumbnailUrl,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Container(
                        color: colorScheme.surfaceContainerHigh,
                        child: Center(
                          child: PrakaroIcon(
                            PrakaroIconData.photo,
                            size: 28,
                            color: colorScheme.outlineVariant,
                          ),
                        ),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: colorScheme.surfaceContainerHigh,
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              PrakaroIcon(
                                PrakaroIconData.photo,
                                size: 30,
                                color: colorScheme.outline,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Photo unavailable',
                                style: TextStyle(
                                  color: colorScheme.outline,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),

            // 2. Photo counter badge in top-right corner
            Positioned(
              top: 10,
              right: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const PrakaroIcon(
                      PrakaroIconData.photo,
                      size: 12,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${validPage + 1} / ${photos.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // 3. Bottom Gradient overlay with Contributor attribution & Google credit
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 16, 10, 6),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.75),
                      Colors.black.withValues(alpha: 0.0),
                    ],
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Contributor name attribution
                    Expanded(
                      child: Text(
                        currentPhoto.attributions.isNotEmpty
                            ? 'By ${currentPhoto.attributions.first.displayName}'
                            : 'Google Maps contributor',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),

                    // Tap to view hint
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.20),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          PrakaroIcon(
                            PrakaroIconData.sparkle,
                            size: 10,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'Tap to view',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
