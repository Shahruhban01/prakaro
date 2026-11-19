import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/app_config.dart';
import '../../domain/parking_photo.dart';

/// Full-screen photo viewer providing pinch-to-zoom, swiping between facility photos,
/// close controls, and required contributor attributions.
class ParkingPhotoViewerScreen extends StatefulWidget {
  const ParkingPhotoViewerScreen({
    super.key,
    required this.photos,
    this.initialIndex = 0,
    required this.facilityName,
  });

  final List<ParkingPhoto> photos;
  final int initialIndex;
  final String facilityName;

  static Future<void> show(
    BuildContext context, {
    required List<ParkingPhoto> photos,
    int initialIndex = 0,
    required String facilityName,
  }) {
    return Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (context) => ParkingPhotoViewerScreen(
          photos: photos,
          initialIndex: initialIndex,
          facilityName: facilityName,
        ),
      ),
    );
  }

  @override
  State<ParkingPhotoViewerScreen> createState() => _ParkingPhotoViewerScreenState();
}

class _ParkingPhotoViewerScreenState extends State<ParkingPhotoViewerScreen> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    final validInitial = (widget.initialIndex >= 0 && widget.initialIndex < widget.photos.length)
        ? widget.initialIndex
        : 0;
    _currentIndex = validInitial;
    _pageController = PageController(initialPage: validInitial);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _launchAttributionUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      try {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Could not open contributor link.'),
              duration: Duration(seconds: 2),
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.photos.isEmpty) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        body: const Center(
          child: Text(
            'No photos available.',
            style: TextStyle(color: Colors.white70),
          ),
        ),
      );
    }

    final currentPhoto = widget.photos[_currentIndex];
    final currentAttributions = currentPhoto.attributions;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // 1. Swipeable Full-Screen Image PageView with Pinch-to-Zoom
          PageView.builder(
            controller: _pageController,
            itemCount: widget.photos.length,
            onPageChanged: (index) {
              setState(() => _currentIndex = index);
            },
            itemBuilder: (context, index) {
              final photo = widget.photos[index];
              final highResUrl = photo.resolvedMediaUrl(
                AppConfig.apiBaseUrl,
                maxWidth: 1920,
                maxHeight: 1200,
              );

              return InteractiveViewer(
                minScale: 1.0,
                maxScale: 4.0,
                clipBehavior: Clip.none,
                child: Center(
                  child: Image.network(
                    highResUrl,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(
                              Icons.photo_size_select_actual_outlined,
                              size: 48,
                              color: Colors.white24,
                            ),
                            SizedBox(height: 12),
                            Text(
                              'Loading photo...',
                              style: TextStyle(color: Colors.white60, fontSize: 12),
                            ),
                          ],
                        ),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.broken_image_outlined,
                                size: 48,
                                color: Colors.white38,
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'Unable to load photo',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Check network connection or try again',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.5),
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              );
            },
          ),

          // 2. Top Navigation Bar Overlay
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.only(top: 8, bottom: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.8),
                    Colors.black.withValues(alpha: 0.0),
                  ],
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: Colors.white, size: 26),
                        tooltip: 'Close viewer',
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.facilityName,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              'Photo ${_currentIndex + 1} of ${widget.photos.length}',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${_currentIndex + 1} / ${widget.photos.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // 3. Bottom Contributor Attribution Overlay
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.85),
                    Colors.black.withValues(alpha: 0.0),
                  ],
                ),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (currentAttributions.isNotEmpty) ...[
                      Row(
                        children: [
                          const Icon(Icons.person_outline, size: 14, color: Colors.white70),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 4,
                              children: currentAttributions.map((attr) {
                                if (attr.uri != null && attr.uri!.isNotEmpty) {
                                  return InkWell(
                                    onTap: () => _launchAttributionUrl(attr.uri!),
                                    borderRadius: BorderRadius.circular(4),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          attr.displayName,
                                          style: const TextStyle(
                                            color: Colors.lightBlueAccent,
                                            decoration: TextDecoration.underline,
                                            decorationColor: Colors.lightBlueAccent,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                        const SizedBox(width: 3),
                                        const Icon(
                                          Icons.open_in_new_rounded,
                                          size: 11,
                                          color: Colors.lightBlueAccent,
                                        ),
                                      ],
                                    ),
                                  );
                                }
                                return Text(
                                  attr.displayName,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Powered by Google',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.5),
                            fontSize: 11,
                            letterSpacing: 0.2,
                          ),
                        ),
                        Text(
                          'Pinch to zoom',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.4),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
