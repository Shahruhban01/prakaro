import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/parking_photo.dart';
import 'parking_providers.dart';

/// Provider fetching photo metadata for a specific parking facility on demand.
/// Family provider avoids repeated Place Details calls for the same facility during the active session.
final parkingPhotosProvider =
    FutureProvider.family<List<ParkingPhoto>, String>((ref, parkingId) async {
  final repository = ref.watch(parkingRepositoryProvider);
  final cancelToken = CancelToken();

  ref.onDispose(() {
    cancelToken.cancel('parkingPhotosProvider disposed');
  });

  return repository.getParkingPhotos(parkingId, cancelToken: cancelToken);
});
