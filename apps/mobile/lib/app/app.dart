import 'package:flutter/material.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../features/splash/presentation/splash_screen.dart';

/// Root Application Widget for Prakaro.
class PrakaroApp extends StatelessWidget {
  const PrakaroApp({
    super.key,
    this.initialHome,
  });

  /// Optional custom initial screen (useful for test harness or direct routing).
  final Widget? initialHome;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      home: initialHome ?? const SplashScreen(),
    );
  }
}
