# Prakaro Architecture Overview

Prakaro is a parking discovery platform designed with a **strictly backend-driven architecture**. The system is built to minimize client-side complexity, protect commercial provider API keys, and maintain centralized control over business logic and data aggregation.

```
+-----------------------------------------------------------------+
|                         Prakaro Mobile                          |
|                        (Flutter / Dart)                         |
|  - UI / Presentation: Full-screen Google Map & Details Sheet    |
|  - State Management: Riverpod (ParkingMapNotifier)              |
|  - Device Location: Geolocator foreground GPS service           |
|  - Map & Marker Rendering: Google Maps Flutter SDK              |
|  - Navigation Dispatch: url_launcher (external directions)      |
|  - HTTP Layer: Dedicated ApiClient (Dio)                        |
+--------------------------------+--------------------------------+
                                 |
                                 | JSON / REST API
                                 v
+-----------------------------------------------------------------+
|                          Prakaro API                            |
|                     (Node.js / TypeScript)                      |
|  - Fastify Web Engine & Route Handlers                          |
|  - Better Auth Engine & Bearer Plugin (/api/auth/*)             |
|  - Request Validation (Zod schemas)                             |
|  - Error Handling & Structured Pino Logging                     |
|  - Rate Limiting (@fastify/rate-limit)                          |
|  - Cloud User Storage & Sync Service (/api/v1/users/me)         |
|  - Places Autocomplete & Details Proxy (/api/v1/places)         |
|  - Parking Discovery & Normalization Orchestrator               |
+----------------+-------------------------------+----------------+
                 |                               |
                 v                               v
+--------------------------------+ +------------------------------+
|       Persistence Layer        | |    External Integrations     |
|      (MySQL 8+ / Prisma)       | |  - Google Places API (New)   |
|  - User & Better Auth Sessions | |    (Nearby, Autocomplete,    |
|  - Saved Parking (Place IDs)   | |     Details, Proxy)          |
|  - Recent Searches (Opt-in)    | |  - Cloudflare R2             |
|  - User Preferences & Sync     | |    (Photo storage - Future)  |
+--------------------------------+ +------------------------------+
```

---

## 1. System Responsibilities

### Mobile Application (`apps/mobile`)
- **Presentation & Viewport**: Render full-screen Google Maps, styled parking markers, loading states, error notices, and parking details bottom sheets.
- **Location Management (`LocationService`)**: Check location availability, request runtime foreground permissions (`ACCESS_FINE_LOCATION`), and fetch single-shot current GPS coordinates. Background tracking is strictly disallowed.
- **External Directions (`NavigationService`)**: Delegate navigation directly to Google Maps via native `google.navigation:`, `geo:`, or universal web fallback links.
- **Pure Consumer Role**: The mobile app communicates **exclusively** with the Prakaro backend API (`GET /api/v1/parking/nearby`).
- **Strict Boundaries**:
  - **No Direct Third-Party Calls**: The mobile client never makes direct requests to Google Places API.
  - **No Web-Service Secrets**: The server-side Google Places API key is never embedded, compiled, or delivered to mobile clients.
  - **Maps SDK Key Isolation**: The Android Maps SDK API key (`com.google.android.geo.API_KEY`) is strictly restricted by Android package name (`com.prakaro.app`) and SHA-1 certificate fingerprint.
  - **No Database Access**: Zero direct connection or knowledge of MySQL.
  - **No Business Logic**: Search radius bounding, normalization, and provider transformations remain backend concerns.

### Backend API (`apps/api`)
- **Central API Gateway & Logic Engine**: Validates coordinates and search radiuses, handles routing, rate limits traffic, and maps errors.
- **Provider Proxy**: Calls Google Places API (New) `POST https://places.googleapis.com/v1/places:searchNearby` with an explicit field mask and 8-second timeout.
- **Data Normalization (`google-places.mapper.ts`)**: Cleanses raw upstream responses, discards malformed records without coordinates, provides safe fallbacks for missing names/addresses, and outputs Prakaro's clean contract (`id`, `name`, `latitude`, `longitude`, `address`, `source: "google"`).
- **Security & Reliability**: Enforces rate limiting, prevents key leakage in logs or responses, and returns standardized JSON errors.

### Persistence Layer (`MySQL 8+` & `Prisma ORM` — Reserved)
- Reserved for subsequent milestones to manage curated parking registries, occupancy updates, and facility metadata.

---

## 2. Mobile Clean Architecture Slices

The mobile codebase follows a modular, feature-first structure:

```
apps/mobile/lib/
├── core/
│   ├── config/              # AppConfig & compile-time Dart defines (API_BASE_URL)
│   ├── errors/              # AppException, NetworkException
│   ├── network/             # Dio ApiClient & error translation
│   ├── services/            # LocationService (GPS) & NavigationService (url_launcher)
│   └── theme/               # Material 3 light/dark theme definitions
├── features/
│   └── parking/
│       ├── domain/          # ParkingLocation entity & ParkingRepository interface
│       ├── data/            # ParkingLocationDto, ParkingRemoteDataSource, ParkingRepositoryImpl
│       └── presentation/    # ParkingHomeScreen (IndexedStack), ParkingListScreen (Default),
│                            # ParkingMapScreen, ParkingViewSwitcher, ParkingCard,
│                            # ParkingLoadingState, ParkingEmptyState, GoogleAttributionFooter
├── app/                     # PrakaroApp root widget (MaterialApp with Light/Dark themes)
└── main.dart                # ProviderScope entry point
```

---

## 3. Screen Architecture & Presentation State

Prakaro utilizes a dual-view presentation model managed by a unified `parkingMapProvider` (Riverpod 3):

```
+---------------------------------------------------------------+
|                    ParkingHomeScreen                          |
|             (Parent IndexedStack Container)                   |
+-------------------------------+-------------------------------+
                                |
        +-----------------------+-----------------------+
        |                                               |
        v                                               v
[ Index 0: ParkingListScreen ]            [ Index 1: ParkingMapScreen ]
  - Default Home View                       - Secondary Interactive Map
  - Clean Material 3 Cards                  - Google Maps SDK
  - Straight-Line Distance Sorting          - Markers & Selection State
  - Pull-to-Refresh & Shimmer Skeletons     - "Search this area" Button
  - Google Places Attribution Footer        - ParkingDetailsSheet Modal
```

- **Zero-Duplicate Search Queries**: Switching between List and Map presentations simply updates `viewMode` in the shared state without triggering repeated network calls or resetting camera/scroll state.
- **On-Device Sorting**: Parking facilities are sorted ascending by approximate straight-line distance relative to device GPS coordinates.

---

## 4. Frontend / Backend Separation Guarantees

1. **Configurable Endpoint Resolution**:
   - Resolved via `--dart-define=API_BASE_URL=...`.
   - Android Emulator defaults to host loopback `http://10.0.2.2:3000`.
   - Physical devices connect via host LAN IP `http://<LAN_IP>:3000`.
2. **Encapsulated Network Layer**:
   - Widgets never initiate raw Dio/HTTP requests. All requests flow through `ParkingRemoteDataSource` and `ParkingRepository`.
3. **Decoupled Contracts**:
   - `ParkingLocationDto` insulates mobile presentation widgets from changes to the backend schema.

---

## 5. Smart Parking Filtering & Enrichment Architecture (Prompt 06)

Prakaro implements a cost-conscious, trustworthy two-stage data enrichment and filtering model:

```
[ Stage A: Batch Discovery ]
GET /api/v1/parking/nearby?latitude=...&longitude=...&pricing=...&openNow=...
  - Calls Google Places searchNearby once with verified field mask
  - Returns candidates with pricingType, openingStatus, parkingOptions
  - Applies server-side logical filtering & straight-line Haversine sorting
  - Cost: 1 searchNearby request per search (zero redundant calls)

[ Stage B: On-Demand Facility Details ]
GET /api/v1/parking/:id
  - Dedicated endpoint for deep details of a specific facility
  - Invoked only on demand when a user inspects details
  - Protects against expensive batch place details calls

[ Mobile Client Reactive Filtering ]
ParkingFilterBar (All, Free, Paid, Open now, Public access)
  - Controlled by shared Riverpod ParkingMapState
  - Mutual exclusivity between Free and Paid
  - Instant client-side candidate re-filtering across List and Map views
  - Synchronized filtered cards and filtered map markers
  - Filter-aware empty states explaining missing provider data honestly
```

### Truthful Data Contracts
- **No Fabricated Pricing**: If Google Places does not return verified `parkingOptions`, pricing is labeled `unknown` / `Price unlisted`. Never guessed from name or category.
- **No Inferred Operating Hours**: If opening hours are absent, status is `unknown`. Never assumed open.
- **No Inferred Access**: Facilities default to `accessType: unknown`. Public filter only includes confirmed public facilities.

---

## 6. Search Radius Controls & Smarter Discovery (Milestone 07)

Milestone 07 introduces interactive radius controls, explicit search center tracking, map circle visualization, and request staleness prevention:

```
[ User Action: Select Radius (1 km, 3 km, 5 km) ]
  │
  ├─► Check unchanged radius: if state.radiusMeters == selected: no-op (0 API calls)
  ├─► Increments _searchRequestId (invalidating in-flight stale responses)
  ├─► Preserves active filters (pricing, openNow, publicAccess)
  ├─► Executes search around active search center (searchCenterLatitude ?? userLatitude)
  │
  ├─► Map View: Updates subtle primary blue radius Circle overlay
  └─► List View: Updates context subtitle ("Within 5 km of your location")
```

### Search Center Disambiguation

| Concept | Riverpod Field | Purpose |
| :--- | :--- | :--- |
| **Device GPS Location** | `userLatitude`, `userLongitude` | Physical device location acquired via Geolocator. Used as default search center and distance reference. |
| **Search Center** | `searchCenterLatitude`, `searchCenterLongitude` | Geographic epicenter used for the current set of discovered facilities. |
| **Custom Area Flag** | `isCustomSearchArea` | `true` when the search was triggered via "Search this area" on a panned map; `false` when searching near device GPS. |
| **Camera Center** | `cameraLatitude`, `cameraLongitude` | Live center of the Google Maps viewport. Used when user taps "Search this area". |
| **Last Searched Origin** | `lastSearchedLatitude`, `lastSearchedLongitude` | Geographic coordinates anchoring the Map radius `Circle` overlay. |

### Distance Calculation Semantics
- When device GPS (`userLatitude`, `userLongitude`) is available, straight-line distances are **always calculated relative to the user's physical position**, even when viewing a custom map search area.
- If GPS is disabled or unavailable, distances fall back to being measured relative to the `searchCenter` with an explicit `(from search center)` notation.
- Distances are clearly documented as approximate straight-line approximations.

### Request Reliability & Staleness Guard
- Rapid successive radius adjustments (e.g., tapping 1 km and immediately 5 km) increment `_searchRequestId`.
- If an older response resolves after a newer search was initiated, `requestId != _searchRequestId` triggers immediate safe discard of the obsolete response.
- Pull-to-refresh retains existing facilities in state (`isRefreshing: true`) to prevent UI jumping.

---

## 7. Performance, Reliability & API Cost Optimization (Milestone 08)

Milestone 08 introduces comprehensive request lifecycle management, client-side debouncing, cancellation propagation, in-flight request coalescing, failure recovery semantics, and in-process Google Places usage tracking:

```
[ User Interaction ]
   │
   ├─► Rapid Radius Changes (1 km -> 3 km -> 5 km)
   │     └─► Debounced by 350 ms. Cancels previous timer. Only executes final 5 km search.
   │
   ├─► Explicit Actions (Refresh, Search This Area, Near Me, Retry)
   │     └─► Bypass debounce (0 ms delay).
   │
   ├─► Duplicate In-Flight Query Coalescing
   │     └─► If an identical ParkingSearchQuery is already active in-flight, returns active Future.
   │
   ├─► Superseded Request Cancellation
   │     └─► Aborts active Dio CancelToken. Treated as clean control-flow (zero error states).
   │
   ├─► Logical Request Identity (ParkingSearchQuery)
   │     └─► Compares (lat, lng, radius) to prevent older responses from overwriting newer state.
   │
   ├─► Refresh Failure Recovery
   │     ├─► If refresh fails on SAME search query: retains loaded locations, marks isStaleResults: true,
   │     │   displays subtle notice banner ("Showing previous results. Refresh to try again.").
   │     └─► If a NEW search fails: clears results to prevent mislabeling old data.
   │
   └─► Categorized Network Error Translation
         ├─► OfflineException -> "You're offline. Connect to the internet to search for parking."
         ├─► NetworkTimeoutException -> "This search is taking longer than expected."
         ├─► RateLimitException -> "Too many searches. Please wait a moment."
         └─► UpstreamServiceException -> "Parking search is temporarily unavailable."
```

### Backend Usage Monitoring & Correlation
- **Request Correlation ID**: Fastify generates or accepts an `X-Request-Id` header and echoes it on every response.
- **In-Process Usage Metrics**: `GooglePlacesMetrics` tracks attempts, successes, failures, timeouts, 429 rate limits, and latency without logging API keys or precise coordinates.
- **Diagnostics Endpoint**: `GET /api/v1/parking/metrics` exposes read-only runtime usage counters and field mask definitions for cost analysis.
- **Compliance & Privacy**: Raw user coordinates in URLs and request bodies are masked to two decimal places in logs (`34.08***`), and no sensitive credentials or places data are stored on persistent disk.

---

## 8. Saved Parking, Favorites & Privacy-First Recent Searches (Milestone 09A)

Milestone 09A introduces persistent local bookmarks for parking facilities, explicit recent search area tracking, on-demand backend resolution, and privacy controls.

```
[ Root Navigation: NavigationBar ]
  ├─► [ Explore Tab (Index 0) ]
  │     └─► IndexedStack: ParkingListScreen (Index 0) / ParkingMapScreen (Index 1)
  │           - State fully preserved across tab switching
  │           - ParkingCard & ParkingDetailsSheet include Save/Bookmark action
  │           - "Search This Area" records search area (if history is enabled)
  │
  └─► [ Saved Tab (Index 1) ]
        └─► SavedParkingScreen
              ├─► Tab A: Saved Facilities
              │     - On-demand resolution via GET /api/v1/parking/places/:id
              │     - Bounded concurrency (up to 3 concurrent requests)
              │     - Honest offline, 404 not found, and timeout states
              │     - Individual remove action & bulk "Clear all" with confirmation
              │     - Google attribution footer
              │
              └─► Tab B: Recent Searches
                    - Privacy control card with toggle switch (DISABLED by default)
                    - Reopen search area via "Search area" (switches to Explore tab)
                    - Individual remove & bulk "Clear all" with confirmation
```

### Strict Google Places Compliance Contract
1. **Zero Google Places Content Persistence**:
   - In accordance with Google Maps Platform Terms of Service, the client application never persists Google Places facility names, addresses, latitude/longitude coordinates, opening hours, prices, ratings, or API response snapshots.
   - Only local references are stored via `SavedParkingRef`:
     ```json
     {
       "id": "google:ChIJ...",
       "provider": "google",
       "providerPlaceId": "ChIJ...",
       "savedAt": "2026-11-19T12:00:00Z"
     }
     ```
2. **On-Demand Facility Resolution**:
   - Facility details are fetched freshly on demand from the Prakaro backend (`GET /api/v1/parking/places/:id`).
   - If a place is no longer found (404), an honest "Facility no longer available" state is shown with a Remove option.
   - If offline, an honest "Connect to the internet to load parking details" state is presented with Retry and Remove actions.
   - Stale responses or unauthorized local caching fallbacks are strictly prohibited.

### Privacy-Preserving Recent Searches
1. **Disabled by Default**: Recent search history recording is turned off by default until the user explicitly toggles it on.
2. **Explicit Actions Only**: Only user-initiated actions ("Search This Area" or explicit search centers) are recorded. Device GPS bootstraps, map panning, and radius adjustments are **never** logged as search history.
3. **Neutral Description**: Recent searches display a neutral description ("Previously searched area" with radius and relative date); fictitious place or neighborhood names are never invented.
4. **Local Device Storage**: All search history is stored locally in device storage via `shared_preferences` and never uploaded to the backend or external telemetry.



---

## Milestone 11: Parking Photos & Visual Facility Details

### Architecture & Security Workflow
```
[ Mobile Client: ParkingDetailsSheet ]
  │
  ├─► 1. Watches `parkingPhotosProvider(parkingId)`
  │      - Requests metadata: `GET /api/v1/parking/:id/photos`
  │
  ├─► 2. Backend executes Place Details with FieldMask: `id,photos`
  │      - Checks 5-min in-memory LRU cache to avoid duplicate API calls
  │      - Normalizes up to 5 photos with width, height, and author attributions
  │      - Returns internal proxy URLs: `/api/v1/parking/:id/photos/:index/media`
  │
  ├─► 3. Mobile displays `ParkingPhotoGallery` (16:9 carousel)
  │      - On image render: calls proxy media endpoint
  │      - Backend validates photoName regex (SSRF protection)
  │      - Streams image bytes with `Cache-Control: public, max-age=86400`
  │
  └─► 4. On Tap: Opens `ParkingPhotoViewerScreen`
         - Full-screen modal with `InteractiveViewer` pinch-to-zoom (1.0x - 4.0x)
         - Preserves author attribution links via `url_launcher`
         - Displays Google Places attribution badge
```

### Compliance & Performance Safeguards
1. **Zero Database Caching**: Google Places photo IDs and media bytes are strictly transient and proxied. MySQL contains no photo data.
2. **SSRF Guard**: Strict regular expression validation (`^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_.-]+$`) and 10MB payload size enforcement on all proxied media requests.
3. **API Key Security**: Google Maps Platform API key is stored exclusively on the backend server and never exposed to the Flutter application.
