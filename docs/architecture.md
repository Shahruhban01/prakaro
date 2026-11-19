# Prakaro Architecture Overview

Prakaro is a parking discovery platform designed with a **strictly backend-driven architecture**. The system is built to minimize client-side complexity, protect commercial provider API keys, and maintain centralized control over business logic and data aggregation.

```
+-------------------------------------------------------+
|                   Prakaro Mobile                      |
|                  (Flutter / Dart)                     |
|  - UI / Presentation (Material 3)                     |
|  - Riverpod State Management                          |
|  - Device Location & Permission Handling              |
|  - Google Maps Viewport & Marker Rendering            |
|  - HTTP Communication via dedicated ApiClient (Dio)   |
+---------------------------+---------------------------+
                            |
                            | JSON / REST API
                            v
+-------------------------------------------------------+
|                    Prakaro API                        |
|              (Node.js / TypeScript)                   |
|  - Fastify Web Engine & Routing                       |
|  - Request Validation (Zod)                           |
|  - Error Handling & Structured Pino Logging           |
|  - Parking Discovery & Normalization Orchestrator     |
+-------------+---------------------------+-------------+
              |                           |
              v                           v
+---------------------------+ +-------------------------+
|     Persistence Layer     | |  External Integrations  |
|      (MySQL 8+ / Prisma)  | |  - Google Places API    |
|  - Parking lots & metadata| |  - Cloudflare R2        |
|  - Rates & operational hrs| |    (Photo storage)      |
+---------------------------+ +-------------------------+
```

---

## 1. System Responsibilities

### Mobile Application (`apps/mobile`)
- **UI & Presentation**: Render Material 3 interface components, map viewports, cards, and modal sheets.
- **Device Interaction**: Manage runtime device permissions (fine location) and obtain current GPS coordinates.
- **Pure Consumer Role**: The mobile app communicates **exclusively** with the Prakaro backend API.
- **Strict Boundary**:
  - **No Direct Third-Party Calls**: The app never contacts Google Places API directly.
  - **No Direct Database Access**: The app has zero awareness of MySQL or database credentials.
  - **No Sensitive Secret Storage**: API keys for external services are never compiled into or delivered to the client.

### Backend API (`apps/api`)
- **Central API Gateway & Logic Engine**: Handles routing, validation, error mapping, and business logic.
- **Provider Orchestration**: Coordinates requests to external location providers (Google Places API), enforces caching strategies, and protects provider API secrets.
- **Data Normalization**: Transforms diverse provider payload schemas into a consistent, predictable client API contract.
- **Configuration & Security**: Enforces environment variable validation at startup using Zod schemas and sensible CORS headers.

### Persistence Layer (`MySQL 8+` & `Prisma ORM`)
- **Data Retention**: Stores structured parking facilities, geolocations, operator rates, operational schedules, and user preference data.
- **Prisma Schema**: Serves as the single source of truth for the backend database models and migrations.

### Future External Integrations
- **Google Places API (New)**: Powers location search, nearby parking queries, place details, and photo references via backend proxies.
- **Cloudflare R2**: Object storage for cached parking spot photos and media assets, preventing egress charges and bypassing rate limits.

---

## 2. Frontend / Backend Separation Guarantees

1. **Configurable Endpoint Resolution**:
   - The Flutter mobile client resolves its API endpoint via compile-time Dart defines (`--dart-define=API_BASE_URL=...`).
   - Defaults are set for developer ergonomics (`http://10.0.2.2:3000` for Android emulator loopback).
2. **Encapsulated Network Layer**:
   - Flutter widgets do not instantiate HTTP requests directly. All network interaction flows through `ApiClient` and domain repository providers.
3. **Decoupled Contracts**:
   - Mobile DTOs model the backend API response directly, insulating UI components from any upstream changes in third-party services.
