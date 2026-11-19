import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/components/prakaro_nav_bar.dart';
import '../../../core/design/prakaro_icons.dart';
import 'parking_list_screen.dart';
import 'parking_map_screen.dart';
import 'parking_providers.dart';
import 'saved_parking_screen.dart';
import 'saved_providers.dart';

/// Root container screen for the parking feature.
/// Houses both Explore (List / Map) and Saved destinations using an IndexedStack
/// to preserve state and avoid unnecessary rebuilds or network requests.
class ParkingHomeScreen extends ConsumerStatefulWidget {
  const ParkingHomeScreen({super.key});

  @override
  ConsumerState<ParkingHomeScreen> createState() => _ParkingHomeScreenState();
}

class _ParkingHomeScreenState extends ConsumerState<ParkingHomeScreen> {
  @override
  void initState() {
    super.initState();
    // Initialize GPS and bootstrap initial nearby search on app startup
    Future.microtask(() {
      if (mounted) {
        ref.read(parkingMapProvider.notifier).init();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final rootNavIndex = ref.watch(rootNavigationIndexProvider);
    final viewMode = ref.watch(
      parkingMapProvider.select((state) => state.viewMode),
    );

    return Scaffold(
      body: IndexedStack(
        index: rootNavIndex,
        children: [
          // Index 0: Explore Destination (List & Map views)
          IndexedStack(
            index: viewMode == ParkingViewMode.list ? 0 : 1,
            children: const [
              ParkingListScreen(),
              ParkingMapScreen(),
            ],
          ),

          // Index 1: Saved Parking Destination
          const SavedParkingScreen(),
        ],
      ),
      bottomNavigationBar: PrakaroNavBar(
        selectedIndex: rootNavIndex,
        onItemSelected: (index) {
          ref.read(rootNavigationIndexProvider.notifier).setIndex(index);
        },
        items: const [
          PrakaroNavItem(
            label: 'Explore',
            icon: PrakaroIconData.search,
            activeIcon: PrakaroIconData.search,
          ),
          PrakaroNavItem(
            label: 'Saved',
            icon: PrakaroIconData.bookmarkOutline,
            activeIcon: PrakaroIconData.bookmarkFilled,
          ),
        ],
      ),
    );
  }
}
