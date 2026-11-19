import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'parking_list_screen.dart';
import 'parking_map_screen.dart';
import 'parking_providers.dart';

/// Root container screen for the parking feature.
/// Houses both List and Map views using an IndexedStack to preserve view state
/// and prevent duplicate network requests when switching views.
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
    final viewMode = ref.watch(
      parkingMapProvider.select((state) => state.viewMode),
    );

    return Scaffold(
      body: IndexedStack(
        index: viewMode == ParkingViewMode.list ? 0 : 1,
        children: const [
          ParkingListScreen(),
          ParkingMapScreen(),
        ],
      ),
    );
  }
}
