import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../prakaro_icons.dart';

class PrakaroNavItem {
  const PrakaroNavItem({
    required this.label,
    required this.icon,
    required this.activeIcon,
  });

  final String label;
  final PrakaroIconData icon;
  final PrakaroIconData activeIcon;
}

/// Custom, minimal bottom navigation bar adhering strictly to the Prakaro mobility design system.
/// Replaces stock Flutter NavigationBar and BottomNavigationBar.
class PrakaroNavBar extends StatelessWidget {
  const PrakaroNavBar({
    super.key,
    required this.selectedIndex,
    required this.onItemSelected,
    required this.items,
  });

  final int selectedIndex;
  final ValueChanged<int> onItemSelected;
  final List<PrakaroNavItem> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final barBg = isDark ? const Color(0xFF14171E) : Colors.white;
    final topBorder = isDark ? AppTheme.borderDark : AppTheme.borderLight;

    return Container(
      decoration: BoxDecoration(
        color: barBg,
        border: Border(
          top: BorderSide(color: topBorder, width: 1.0),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.30 : 0.04),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60.0,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(items.length, (index) {
              final item = items[index];
              final isSelected = index == selectedIndex;

              final fgColor = isSelected
                  ? AppTheme.primaryBlue
                  : (isDark ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLight);

              return Expanded(
                child: Semantics(
                  button: true,
                  selected: isSelected,
                  label: item.label,
                  child: GestureDetector(
                    onTap: () {
                      if (!isSelected) {
                        AppHaptics.selection();
                        onItemSelected(index);
                      }
                    },
                    behavior: HitTestBehavior.opaque,
                    child: Center(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 160),
                        curve: Curves.easeOutCubic,
                        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? (isDark
                                  ? AppTheme.accentSoftDark
                                  : AppTheme.accentSoftLight)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            PrakaroIcon(
                              isSelected ? item.activeIcon : item.icon,
                              size: 19.0,
                              color: fgColor,
                            ),
                            const SizedBox(width: 7.0),
                            Text(
                              item.label,
                              style: TextStyle(
                                fontSize: 13.0,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                letterSpacing: -0.1,
                                color: fgColor,
                                height: 1.0,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
