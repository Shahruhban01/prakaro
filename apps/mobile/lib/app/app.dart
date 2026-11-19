import 'package:flutter/material.dart';

import '../core/config/app_config.dart';
import '../core/theme/app_theme.dart';
import '../features/parking/presentation/parking_home_screen.dart';

/// Root Application Widget for Prakaro.
class PrakaroApp extends StatelessWidget {
  const PrakaroApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      home: const ParkingHomeScreen(),
    );
  }
}
