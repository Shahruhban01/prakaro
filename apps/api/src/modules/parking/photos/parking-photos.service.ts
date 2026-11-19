import { NotFoundError } from '../../../common/errors/app-error';
import { GooglePlacesClient } from '../../../integrations/google-places/google-places.client';
import {
  GooglePlacePhoto,
  NormalizedParkingPhoto,
  ParkingPhotosResponse,
} from '../../../integrations/google-places/google-places.types';

interface CachedPhotoMetadata {
  photos: GooglePlacePhoto[];
  timestamp: number;
}

export class ParkingPhotosService {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory TTL
  private static readonly MAX_PHOTOS = 5; // Initial gallery limit
  private readonly metadataCache = new Map<string, CachedPhotoMetadata>();

  constructor(private readonly googlePlacesClient: GooglePlacesClient) {}

  private cleanId(rawId: string): string {
    return rawId.startsWith('google:') ? rawId.replace(/^google:/, '') : rawId;
  }

  private async getCachedOrFetchPhotos(cleanId: string): Promise<GooglePlacePhoto[]> {
    const cached = this.metadataCache.get(cleanId);
    const now = Date.now();

    if (cached && now - cached.timestamp < ParkingPhotosService.CACHE_TTL_MS) {
      return cached.photos;
    }

    const photos = await this.googlePlacesClient.getPlacePhotos(cleanId);
    this.metadataCache.set(cleanId, {
      photos,
      timestamp: now,
    });

    // Prune cache if it grows beyond 500 items
    if (this.metadataCache.size > 500) {
      const oldestKey = this.metadataCache.keys().next().value;
      if (oldestKey) {
        this.metadataCache.delete(oldestKey);
      }
    }

    return photos;
  }

  /**
   * Retrieves normalized photo metadata for a parking facility.
   * Limits results to at most 5 photographs.
   */
  public async getFacilityPhotos(facilityId: string): Promise<ParkingPhotosResponse> {
    const cleanId = this.cleanId(facilityId);
    const photos = await this.getCachedOrFetchPhotos(cleanId);

    const limitedPhotos = photos.slice(0, ParkingPhotosService.MAX_PHOTOS);

    const normalized: NormalizedParkingPhoto[] = limitedPhotos.map((photo, index) => ({
      id: String(index),
      width: photo.widthPx,
      height: photo.heightPx,
      attributions: (photo.authorAttributions ?? []).map((attr) => ({
        displayName: attr.displayName || 'Photo Contributor',
        uri: attr.uri,
      })),
      mediaUrl: `/api/v1/parking/${encodeURIComponent(cleanId)}/photos/${index}/media`,
    }));

    return {
      data: normalized,
      meta: {
        count: normalized.length,
        source: 'google',
      },
    };
  }

  /**
   * Resolves and retrieves the media stream for a specific photo index.
   */
  public async getFacilityPhotoMedia(
    facilityId: string,
    photoIndex: number,
    dimensions: { maxWidth?: number; maxHeight?: number } = {},
  ): Promise<{
    body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | null;
    contentType: string;
    contentLength?: number;
  }> {
    const cleanId = this.cleanId(facilityId);
    const photos = await this.getCachedOrFetchPhotos(cleanId);

    if (!photos || photos.length === 0) {
      throw new NotFoundError(`No photos available for parking facility '${facilityId}'.`);
    }

    if (photoIndex < 0 || photoIndex >= photos.length) {
      throw new NotFoundError(
        `Photo at index ${photoIndex} was not found for parking facility '${facilityId}'.`,
      );
    }

    const photo = photos[photoIndex];
    if (!photo || !photo.name) {
      throw new NotFoundError(`Photo resource reference missing for index ${photoIndex}.`);
    }

    return this.googlePlacesClient.getPhotoMedia(photo.name, {
      maxWidthPx: dimensions.maxWidth,
      maxHeightPx: dimensions.maxHeight,
    });
  }

  public clearCache(): void {
    this.metadataCache.clear();
  }
}
