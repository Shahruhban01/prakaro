import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/providers/auth_providers.dart';
import '../../parking/presentation/parking_home_screen.dart';

/// A smooth, consumer-grade branded splash screen for Prakaro.
///
/// Features:
/// - Exact brand navy canvas (#030A1D) matching native Android window background
/// - Staggered choreography: scale & fade entrance for emblem, slide & fade for the attached wordmark
/// - Ambient radial glow with subtle pulse
/// - Asynchronous session pre-warming without UI freezing
/// - Silk-smooth cross-fade transition into [ParkingHomeScreen]
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({
    super.key,
    this.minDisplayDuration = const Duration(milliseconds: 1800),
    this.nextScreen,
  });

  /// Duration to display the splash animation before transitioning.
  final Duration minDisplayDuration;

  /// Custom destination widget, defaults to [ParkingHomeScreen].
  final Widget? nextScreen;

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _glowAnimation;
  late final Animation<double> _emblemFade;
  late final Animation<double> _emblemScale;
  late final Animation<double> _wordmarkFade;
  late final Animation<Offset> _wordmarkSlide;
  late final Animation<double> _taglineFade;
  late final Animation<double> _indicatorFade;

  Timer? _transitionTimer;
  bool _isNavigating = false;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );

    _glowAnimation = Tween<double>(begin: 0.12, end: 0.28).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.6, curve: Curves.easeInOut),
      ),
    );

    _emblemFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.45, curve: Curves.easeOutCubic),
      ),
    );

    _emblemScale = Tween<double>(begin: 0.84, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.50, curve: Curves.easeOutBack),
      ),
    );

    _wordmarkFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.25, 0.70, curve: Curves.easeOutCubic),
      ),
    );

    _wordmarkSlide = Tween<Offset>(
      begin: const Offset(0.0, 0.25),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.25, 0.70, curve: Curves.easeOutCubic),
      ),
    );

    _taglineFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.45, 0.85, curve: Curves.easeOutCubic),
      ),
    );

    _indicatorFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.60, 1.0, curve: Curves.easeOutCubic),
      ),
    );

    _controller.forward();

    // Defer bootstrap until after the initial frame is mounted
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _startBootstrapSequence();
      }
    });
  }

  Future<void> _startBootstrapSequence() async {
    final startTime = DateTime.now();

    // Background warmup tasks after mount
    try {
      ref.read(authProvider.notifier).checkSession();
    } catch (_) {
      // Ignored during bootstrap
    }

    final elapsed = DateTime.now().difference(startTime);
    final remaining = widget.minDisplayDuration - elapsed;

    if (remaining > Duration.zero) {
      _transitionTimer = Timer(remaining, _navigateToNextScreen);
    } else {
      _navigateToNextScreen();
    }
  }

  void _navigateToNextScreen() {
    if (!mounted || _isNavigating) return;
    _isNavigating = true;

    final targetScreen = widget.nextScreen ?? const ParkingHomeScreen();

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => targetScreen,
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOutCubic,
            ),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    );
  }

  @override
  void dispose() {
    _transitionTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const splashNavy = Color(0xFF030A1D);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: splashNavy,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: splashNavy,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _navigateToNextScreen, // Allow tap to skip if user desires
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Ambient radial glow behind emblem
              AnimatedBuilder(
                animation: _glowAnimation,
                builder: (context, child) {
                  return Center(
                    child: Container(
                      width: 280,
                      height: 280,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            const Color(0xFF1E50D8).withValues(alpha: _glowAnimation.value),
                            splashNavy.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),

              // Center content: Emblem + Wordmark + Tagline
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Emblem: scale & fade
                      AnimatedBuilder(
                        animation: _controller,
                        builder: (context, child) {
                          return Opacity(
                            opacity: _emblemFade.value,
                            child: Transform.scale(
                              scale: _emblemScale.value,
                              child: child,
                            ),
                          );
                        },
                        child: Container(
                          width: 88,
                          height: 88,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(22),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF2458D3).withValues(alpha: 0.28),
                                blurRadius: 28,
                                spreadRadius: -2,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(22),
                            child: Image.asset(
                              'assets/icons/app-icon.png',
                              fit: BoxFit.contain,
                              errorBuilder: (context, error, stackTrace) {
                                return const Icon(
                                  Icons.local_parking_rounded,
                                  size: 64,
                                  color: Color(0xFF2B8CFF),
                                );
                              },
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 22),

                      // Wordmark: attached brand typography
                      AnimatedBuilder(
                        animation: _controller,
                        builder: (context, child) {
                          return Opacity(
                            opacity: _wordmarkFade.value,
                            child: FractionalTranslation(
                              translation: _wordmarkSlide.value,
                              child: child,
                            ),
                          );
                        },
                        child: Image.asset(
                          'assets/images/prakaro_wordmark_tight.png',
                          height: 38,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) {
                            return const Text(
                              'Prakaro',
                              style: TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                letterSpacing: -0.5,
                              ),
                            );
                          },
                        ),
                      ),

                      const SizedBox(height: 12),

                      // Subtitle Tagline
                      FadeTransition(
                        opacity: _taglineFade,
                        child: const Text(
                          'SMART PARKING DISCOVERY',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 2.6,
                            color: Color(0xFF7E8EA5),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Bottom subtle loading pulse & minimal indicator
              Positioned(
                left: 0,
                right: 0,
                bottom: 44,
                child: FadeTransition(
                  opacity: _indicatorFade,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 80,
                          height: 2.5,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(2),
                            color: Colors.white.withValues(alpha: 0.08),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(2),
                            child: const LinearProgressIndicator(
                              backgroundColor: Colors.transparent,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Color(0xFF2B8CFF),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
