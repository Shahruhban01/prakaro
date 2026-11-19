import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Central design tokens, color palettes, typography hierarchies, and Material 3 theme
/// definitions for the Prakaro mobile application.
///
/// Implements a sophisticated, human-centered mobility design language:
/// - Neutral-first canvas with deliberate, trustworthy mobility blue accent (#2458D3)
/// - Balanced spatial rhythm (4-point and 8-point grid)
/// - Crisp typography scale prioritizing scannability and natural language
/// - Soft elevation and diffused borders (#E8EAED) replacing harsh outlines
class AppTheme {
  AppTheme._();

  // --- Core Brand & Neutral Colors ---
  static const Color primaryBlue = Color(0xFF2458D3);
  static const Color primaryBlueHover = Color(0xFF1E4AB5);
  static const Color accentSoftLight = Color(0xFFEDF3FF);
  static const Color accentSoftDark = Color(0xFF14223E);

  static const Color canvasLight = Color(0xFFFFFFFF);
  static const Color surfaceSecondaryLight = Color(0xFFF7F8FA);
  static const Color surfaceCardLight = Color(0xFFFFFFFF);
  static const Color borderLight = Color(0xFFE8EAED);
  static const Color borderSubtleLight = Color(0xFFF0F2F5);

  static const Color textPrimaryLight = Color(0xFF17191C);
  static const Color textSecondaryLight = Color(0xFF737980);
  static const Color textTertiaryLight = Color(0xFF9AA0A6);

  static const Color canvasDark = Color(0xFF0F1115);
  static const Color surfaceSecondaryDark = Color(0xFF161920);
  static const Color surfaceCardDark = Color(0xFF1C2029);
  static const Color borderDark = Color(0xFF282E3B);
  static const Color borderSubtleDark = Color(0xFF1F2430);

  static const Color textPrimaryDark = Color(0xFFF2F4F7);
  static const Color textSecondaryDark = Color(0xFF8D96A5);
  static const Color textTertiaryDark = Color(0xFF667085);

  // Semantic Status Colors
  static const Color successGreen = Color(0xFF27845B);
  static const Color successSoftLight = Color(0xFFEBFBF3);
  static const Color successSoftDark = Color(0xFF0E281C);

  static const Color warningAmber = Color(0xFFD97706);
  static const Color warningSoftLight = Color(0xFFFFFBEB);
  static const Color warningSoftDark = Color(0xFF2D1F08);

  static const Color errorRed = Color(0xFFD92D20);
  static const Color errorSoftLight = Color(0xFFFEECEB);
  static const Color errorSoftDark = Color(0xFF2E1010);

  // --- Spatial Rhythm Tokens ---
  static const double space2 = 2.0;
  static const double space4 = 4.0;
  static const double space8 = 8.0;
  static const double space12 = 12.0;
  static const double space16 = 16.0;
  static const double space20 = 20.0;
  static const double space24 = 24.0;
  static const double space32 = 32.0;
  static const double space40 = 40.0;

  // --- Corner Geometry Radii ---
  static const double radiusMicro = 6.0;
  static const double radiusSmall = 8.0;
  static const double radiusMedium = 12.0;
  static const double radiusCard = 16.0;
  static const double radiusLarge = 20.0;
  static const double radiusSheet = 24.0;
  static const double radiusPill = 100.0;

  // --- Modern Diffused Shadows ---
  static const List<BoxShadow> cardShadowLight = [
    BoxShadow(
      color: Color(0x08000000),
      blurRadius: 10,
      offset: Offset(0, 2),
    ),
    BoxShadow(
      color: Color(0x05000000),
      blurRadius: 20,
      offset: Offset(0, 6),
    ),
  ];

  static const List<BoxShadow> floatingShadowLight = [
    BoxShadow(
      color: Color(0x12000000),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  static const List<BoxShadow> cardShadowDark = [
    BoxShadow(
      color: Color(0x28000000),
      blurRadius: 12,
      offset: Offset(0, 3),
    ),
  ];

  // --- Light Theme ---
  static ThemeData get lightTheme {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: primaryBlue,
      onPrimary: Colors.white,
      primaryContainer: accentSoftLight,
      onPrimaryContainer: primaryBlue,
      secondary: textSecondaryLight,
      onSecondary: Colors.white,
      secondaryContainer: surfaceSecondaryLight,
      onSecondaryContainer: textPrimaryLight,
      surface: canvasLight,
      onSurface: textPrimaryLight,
      surfaceContainerLowest: canvasLight,
      surfaceContainerLow: surfaceSecondaryLight,
      surfaceContainer: Color(0xFFF1F3F6),
      surfaceContainerHigh: Color(0xFFE9ECF0),
      surfaceContainerHighest: Color(0xFFE0E4E9),
      onSurfaceVariant: textSecondaryLight,
      outline: borderLight,
      outlineVariant: borderSubtleLight,
      error: errorRed,
      onError: Colors.white,
      errorContainer: errorSoftLight,
      onErrorContainer: errorRed,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: canvasLight,
      fontFamilyFallback: const ['Inter', 'Roboto', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      dividerColor: borderLight,
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: canvasLight,
        foregroundColor: textPrimaryLight,
        surfaceTintColor: Colors.transparent,
      ),
      textTheme: _buildTextTheme(textPrimaryLight, textSecondaryLight),
      splashFactory: InkRipple.splashFactory,
    );
  }

  // --- Dark Theme ---
  static ThemeData get darkTheme {
    const colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: Color(0xFF3B76F6),
      onPrimary: Colors.white,
      primaryContainer: accentSoftDark,
      onPrimaryContainer: Color(0xFF90B5FF),
      secondary: textSecondaryDark,
      onSecondary: Colors.white,
      secondaryContainer: surfaceSecondaryDark,
      onSecondaryContainer: textPrimaryDark,
      surface: canvasDark,
      onSurface: textPrimaryDark,
      surfaceContainerLowest: canvasDark,
      surfaceContainerLow: surfaceSecondaryDark,
      surfaceContainer: surfaceCardDark,
      surfaceContainerHigh: Color(0xFF222834),
      surfaceContainerHighest: Color(0xFF2A3140),
      onSurfaceVariant: textSecondaryDark,
      outline: borderDark,
      outlineVariant: borderSubtleDark,
      error: Color(0xFFF04438),
      onError: Colors.white,
      errorContainer: errorSoftDark,
      onErrorContainer: Color(0xFFFDA29B),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: canvasDark,
      fontFamilyFallback: const ['Inter', 'Roboto', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      dividerColor: borderDark,
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: canvasDark,
        foregroundColor: textPrimaryDark,
        surfaceTintColor: Colors.transparent,
      ),
      textTheme: _buildTextTheme(textPrimaryDark, textSecondaryDark),
      splashFactory: InkRipple.splashFactory,
    );
  }

  static TextTheme _buildTextTheme(Color primaryText, Color secondaryText) {
    return TextTheme(
      headlineLarge: TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.6,
        color: primaryText,
        height: 1.25,
      ),
      headlineMedium: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: primaryText,
        height: 1.28,
      ),
      headlineSmall: TextStyle(
        fontSize: 19,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: primaryText,
        height: 1.30,
      ),
      titleLarge: TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: primaryText,
        height: 1.32,
      ),
      titleMedium: TextStyle(
        fontSize: 15.5,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
        color: primaryText,
        height: 1.35,
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.15,
        color: primaryText,
        height: 1.35,
      ),
      bodyLarge: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.1,
        color: primaryText,
        height: 1.45,
      ),
      bodyMedium: TextStyle(
        fontSize: 13.5,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.1,
        color: primaryText,
        height: 1.42,
      ),
      bodySmall: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        letterSpacing: 0,
        color: secondaryText,
        height: 1.38,
      ),
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
        color: primaryText,
      ),
      labelMedium: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.05,
        color: primaryText,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0,
        color: secondaryText,
      ),
    );
  }
}

/// Tactile, subtle haptic feedback utilities.
class AppHaptics {
  AppHaptics._();

  static void selection() {
    HapticFeedback.selectionClick();
  }

  static void lightImpact() {
    HapticFeedback.lightImpact();
  }

  static void mediumImpact() {
    HapticFeedback.mediumImpact();
  }
}
