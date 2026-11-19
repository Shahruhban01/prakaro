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
|  - Request Validation (Zod schemas)                             |
|  - Error Handling & Structured Pino Logging                     |
|  - Rate Limiting (@fastify/rate-limit)                          |
|  - Parking Discovery & Normalization Orchestrator               |
+----------------+-------------------------------+----------------+
                 |                               |
                 v                               v
+--------------------------------+ +------------------------------+
|       Persistence Layer        | |    External Integrations     |
|      (MySQL 8+ / Prisma)       | |  - Google Places API (New)   |
|  - Structured parking registry | |    (Backend secret proxy)    |
|  - Rates & operational hours   | |  - Cloudflare R2             |
|                                | |    (Photo storage - Future)  |
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

