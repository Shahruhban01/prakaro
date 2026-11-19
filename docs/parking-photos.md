# Parking Photos & Visual Facility Details (Milestone 11)

## 1. Overview & Architecture

Prakaro Milestone 11 introduces visual parking facility inspection via Google Places API (New) Place Photos. Users can preview parking entrance and facility condition directly within the mobile application without leaving the discovery flow.

To strictly uphold Google Maps Platform Terms of Service, user privacy, and system security:
- **Zero Database Persistence**: Google Places photo identifiers, URLs, and image bytes are never saved to MySQL or Cloudflare R2.
- **Secure Backend Proxy**: The Fastify API layer acts as a secure, streaming media proxy (`/api/v1/parking/:id/photos` and `/api/v1/parking/:id/photos/:photoIndex/media`). The Google Places API key is never exposed to the client or embedded in client responses.
- **SSRF Hardening**: Upstream photo requests are validated against strict regex patterns (`^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_.-]+$`) and size constraints (10MB maximum).
- **Cost & Performance Optimization**: In-memory 5-minute TTL caching prevents redundant Place Details requests, and Riverpod family providers cache metadata per active session.

---

## 2. API Endpoints

### 2.1 Facility Photo Metadata
- **Route**: `GET /api/v1/parking/:id/photos`
- **Auth**: Public / Guest-accessible (authentication optional).
- **Parameters**:
  - `id` (path): Google Place ID (`places/ChIJ...` or `ChIJ...` or `google:ChIJ...`).
- **Response Format**:
```json
{
  "facilityId": "google:ChIJtest123",
  "photos": [
    {
      "id": "0",
      "source": "google",
      "width": 1920,
      "height": 1080,
      "attributions": [
        {
          "displayName": "Alex Traveler",
          "uri": "https://maps.google.com/maps/contrib/123456789"
        }
      ],
      "mediaUrl": "/api/v1/parking/google:ChIJtest123/photos/0/media"
    }
  ],
  "total": 1
}
```
- **Rules**:
  - Maximum of 5 photos returned per facility to preserve bandwidth and reduce upstream overhead.
  - Returns `photos: []` when no photos exist on the upstream facility.
  - Upstream Place Details requests use minimal field mask: `id,photos`.

### 2.2 Facility Photo Media Stream
- **Route**: `GET /api/v1/parking/:id/photos/:photoIndex/media`
- **Auth**: Public / Guest-accessible.
- **Parameters**:
  - `id` (path): Google Place ID.
  - `photoIndex` (path): 0-indexed integer corresponding to normalized photo list (0 to 4).
  - `maxWidth` (query, optional): integer between 100 and 4800 (default: 1200).
  - `maxHeight` (query, optional): integer between 100 and 4800 (default: 800).
- **Response**:
  - Content-Type: `image/jpeg`, `image/png`, or `image/webp`.
  - Cache-Control: `public, max-age=86400` (24-hour browser/client caching header).
  - Status: `200 OK` streaming binary image bytes.

---

## 3. Security, Privacy & Compliance

| Requirement | Implementation |
|---|---|
| **API Key Protection** | Mobile client only receives internal proxy URLs (`/api/v1/parking/:id/photos/:index/media`). The backend injects `X-Goog-Api-Key` upstream. |
| **SSRF Prevention** | `photoName` must match regex `^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_.-]+$`. Any deviation throws `400 Bad Request`. |
| **Payload Integrity** | Responses larger than 10MB or non-image `Content-Type` headers from upstream are rejected with `502 UpstreamError`. |
| **Attribution** | Contributor `displayName` and clickable `uri` are preserved in metadata and rendered in both carousel and full-screen viewer. "Powered by Google Places" attribution footer is anchored on all screens. |
| **Zero Database Storage** | MySQL schema stores zero photo records or URLs. Everything is resolved transiently on demand. |

---

## 4. Mobile UX & Architecture

### 4.1 State Management (`parking_photos_provider.dart`)
- Managed with Riverpod `FutureProvider.family<List<ParkingPhoto>, String>`.
- Prevents redundant network calls when users toggle between List and Map view or re-open the bottom sheet for the same facility.
- Includes automatic cancellation via `Dio.CancelToken` when the provider is disposed.

### 4.2 Gallery Carousel (`ParkingPhotoGallery`)
- Embedded directly at the top of `ParkingDetailsSheet`.
- 16:9 aspect ratio (`AspectRatio(aspectRatio: 16 / 9)`).
- Rounded corners (`16px`) matching Prakaro design system.
- Pill counter badge (e.g. `1 / 5`) in top corner.
- Contributor name pill displayed when attribution exists.
- Tapping carousel navigates to `ParkingPhotoViewerScreen`.
- Loading state: Clean themed skeleton placeholder box (`Icons.photo_library_outlined`).
- Empty state: *"No photos available for this parking location."* with parking icon container.
- Error state: Inline error row with *"Unable to load photos right now."* and a working **Retry** button.

### 4.3 Full-Screen Photo Viewer (`ParkingPhotoViewerScreen`)
- Dark-themed full-screen modal with smooth hero transition.
- Pinch-to-zoom and pan via `InteractiveViewer(minScale: 1.0, maxScale: 4.0)`.
- Horizontal swipe pagination across all facility photos.
- Contributor attribution chip with clickable link opening contributor profile in external browser via `url_launcher`.
- Google Places attribution badge.
- Dedicated close button (`Icons.close_rounded`) and Android back button support.

---

## 5. Metrics & API Cost Monitoring

Photo operations are monitored in-process and exposed via `GET /api/v1/parking/metrics`:
- `photoMetadata`: tracks attempts, successes, failures, timeouts, rateLimited, and successRate for `Place Details (id,photos)` calls.
- `photoMedia`: tracks attempts, successes, failures, timeouts, rateLimited, and total `bytesTransferred` for `Place Photo` media stream calls.
- In-memory LRU/TTL cache stores photo metadata for 5 minutes, mitigating cost and latency for repeatedly viewed parking spots.
