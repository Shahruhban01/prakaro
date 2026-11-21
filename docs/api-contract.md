# Prakaro API Contract

This document defines the REST API endpoints provided by the **Prakaro API** service (`apps/api`).

---

## Global Standards

- **Base URL**: `/`
- **Default Format**: JSON (`Content-Type: application/json; charset=utf-8`)
- **Correlation Header**: `X-Request-Id` (unique correlation ID echoed on every response)
- **Error Format**:
  All error responses adhere to the standard structured envelope:
  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable description of the error"
    }
  }
  ```

---

## 1. System Endpoints

### Health Check

Returns the operational status and service identifier of the backend instance.

- **URL**: `/health`
- **Method**: `GET`
- **Authentication**: None
- **Rate Limit**: Default global limit (100 req/min)

#### Success Response (`200 OK`)

```json
{
  "status": "ok",
  "service": "prakaro-api"
}
```

---

## 2. Parking Discovery API

### A. Discover Nearby Parking (Stage A)

Discovers parking facilities within a specified geographical bounding radius using the Google Places API (New) upstream provider. Results are normalized into Prakaro's clean client schema with optional facility enrichment and server-side logical filtering.

- **URL**: `/api/v1/parking/nearby`
- **Method**: `GET`
- **Authentication**: None (MVP phase; protected via backend rate limiting)
- **Rate Limit**: 60 requests per minute per IP address
- **Query Parameters**:

| Parameter | Type | Required | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `latitude` | `number` | **Yes** | `-90.0` to `90.0` | — | Latitude coordinate of the user's search center |
| `longitude`| `number` | **Yes** | `-180.0` to `180.0` | — | Longitude coordinate of the user's search center |
| `radius`   | `number` | No | `100` to `5000` | `3000` | Search bounding radius in meters |
| `pricing`  | `string` | No | `'all'`, `'free'`, `'paid'` | `'all'` | Logical pricing filter |
| `openNow`  | `boolean`| No | `true`, `false` | `false` | When true, includes only confirmed currently open facilities |
| `access`   | `string` | No | `'all'`, `'public'` | `'all'` | Logical access filter |
| `sort`     | `string` | No | `'distance'` | `'distance'`| Sorting mode (default: nearest first by straight-line distance) |

#### Success Response (`200 OK`)

```json
{
  "data": [
    {
      "id": "google:ChIJZVma6EOP4TgRxagbQBLFB64",
      "name": "Mechanised Car Parking",
      "latitude": 34.0730,
      "longitude": 74.8106,
      "address": "Exchange Rd, Srinagar, 190001",
      "source": "google",
      "accessType": "unknown",
      "ownershipType": "unknown",
      "pricingType": "paid",
      "openingStatus": "open",
      "parkingOptions": {
        "freeParkingLot": null,
        "paidParkingLot": true,
        "freeStreetParking": null,
        "paidStreetParking": null,
        "freeGarageParking": null,
        "paidGarageParking": null
      },
      "hourlyRate": null,
      "currency": null
    }
  ],
  "meta": {
    "count": 1,
    "totalDiscovered": 15,
    "radiusMeters": 3000,
    "filterApplied": {
      "pricing": "all",
      "openNow": false,
      "access": "all",
      "sort": "distance"
    },
    "filteredOnCandidateSet": true
  }
}
```

#### Backward Compatibility Notice
Existing clients reading `data[0].id`, `data[0].name`, `data[0].latitude`, `data[0].longitude`, `data[0].address`, `data[0].source`, `meta.count`, and `meta.radiusMeters` continue to function without any breaking changes.

---

### B. Single Facility Details (Stage B: On-Demand)

Retrieves deep details for a specific parking facility on demand. This avoids uncontrolled upstream requests by only fetching details when a user inspects a facility or when resolving user-saved parking bookmarks on demand.

- **URL**: `/api/v1/parking/places/:id` or `/api/v1/parking/:id`
- **Method**: `GET`
- **Authentication**: None
- **Rate Limit**: 60 requests per minute per IP address
- **URL Parameters**:
  - `id`: Unique facility identifier (e.g., `google:ChIJZVma6EOP4TgRxagbQBLFB64` or Place ID `ChIJZVma6EOP4TgRxagbQBLFB64`).

#### Success Response (`200 OK`)

```json
{
  "data": {
    "id": "google:ChIJZVma6EOP4TgRxagbQBLFB64",
    "name": "Mechanised Car Parking",
    "latitude": 34.0730,
    "longitude": 74.8106,
    "address": "Exchange Rd, Srinagar, 190001",
    "source": "google",
    "accessType": "unknown",
    "ownershipType": "unknown",
    "pricingType": "paid",
    "openingStatus": "open",
    "parkingOptions": {
      "freeParkingLot": null,
      "paidParkingLot": true,
      "freeStreetParking": null,
      "paidStreetParking": null,
      "freeGarageParking": null,
      "paidGarageParking": null
    },
    "hourlyRate": null,
    "currency": null
  }
}
```

### C. In-Process Metrics & Diagnostics

Returns aggregate runtime usage counters for upstream Google Places requests without revealing API keys, authorization tokens, or precise user coordinates.

- **URL**: `/api/v1/parking/metrics`
- **Method**: `GET`
- **Authentication**: None
- **Rate Limit**: 60 requests per minute per IP address

#### Success Response (`200 OK`)

```json
{
  "data": {
    "nearbySearch": {
      "attempts": 42,
      "success": 40,
      "failures": 2,
      "timeouts": 1,
      "rateLimited": 1,
      "successRate": 95.2
    },
    "placeDetails": {
      "attempts": 5,
      "success": 5,
      "failures": 0,
      "timeouts": 0,
      "rateLimited": 0,
      "successRate": 100.0
    },
    "totals": {
      "totalUpstreamRequests": 47,
      "totalSuccess": 45,
      "totalFailures": 2,
      "totalDurationMs": 14250,
      "averageDurationMs": 303
    },
    "fieldMasks": {
      "searchFieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.parkingOptions,places.currentOpeningHours,places.primaryType,places.types",
      "detailsFieldMask": "id,displayName,formattedAddress,location,businessStatus,parkingOptions,currentOpeningHours,regularOpeningHours"
    },
    "costEstimation": {
      "note": "Estimated costs depend on current Google Maps Platform SKU rates and billing account usage.",
      "nearbySearchSku": "Places API (New) - Nearby Search Enterprise + Atmosphere",
      "placeDetailsSku": "Places API (New) - Place Details (Essentials/Pro based on field mask)"
    }
  }
}
```

---

## 3. Metadata Filtering Rules & Truthfulness Contract

1. **Pricing Classification**:
   - `free`: Only facilities where the upstream provider confirmed `freeParkingLot`, `freeStreetParking`, or `freeGarageParking` are true and no paid options are true.
   - `paid`: Only facilities where the upstream provider confirmed `paidParkingLot`, `paidStreetParking`, or `paidGarageParking` are true and no free options are true.
   - `mixed`: Facilities offering both free and paid options. Matches both `pricing=free` and `pricing=paid`.
   - `unknown`: No options confirmed. Included in `pricing=all`, excluded from `free` and `paid`.
   - **Strict Rule**: Pricing is *never* guessed from facility name or category.

2. **Opening Status**:
   - `open`: Provider explicitly confirms `currentOpeningHours.openNow == true` and operational business status.
   - `closed`: Provider confirms `currentOpeningHours.openNow == false` or business is temporarily/permanently closed.
   - `unknown`: Operating hours unlisted. Never assumed open just because hours are missing.

3. **Public Access**:
   - `unknown` by default unless explicitly supplied by upstream data.

4. **Pricing Estimates**:
   - `hourlyRate` and `currency` are `null` unless verified provider data exists. The system never invents placeholder rates.

---

## 4. Error Responses

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_QUERY_PARAMS` | Query parameter failed validation |
| `401 Unauthorized` | `UNAUTHORIZED` | Bearer token missing, invalid, or expired |
| `403 Forbidden` | `FORBIDDEN` | Access denied for the authenticated user |
| `404 Not Found` | `NOT_FOUND` | Facility ID, user, or resource not found |
| `409 Conflict` | `CONFLICT` | Resource already exists or uniqueness violated |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Request threshold exceeded |
| `502 Bad Gateway` | `UPSTREAM_ERROR` | Google Places API error |
| `503 Service Unavailable` | `CONFIGURATION_ERROR` | Server missing Google Places API key |
| `504 Gateway Timeout` | `UPSTREAM_TIMEOUT` | Google Places request timed out |

---

## 5. Better Auth Endpoints (`/api/auth/*`)

Managed via official Better Auth engine with Bearer plugin.

### A. Sign Up
- **URL**: `/api/auth/sign-up/email`
- **Method**: `POST`
- **Body**: `{ "email": "user@example.com", "password": "securepassword123", "name": "Jane Doe" }`
- **Success (`200 OK`)**: `{ "user": { "id": "...", "email": "...", "name": "..." }, "token": "<session_token>" }`

### B. Sign In
- **URL**: `/api/auth/sign-in/email`
- **Method**: `POST`
- **Body**: `{ "email": "user@example.com", "password": "securepassword123" }`
- **Success (`200 OK`)**: `{ "user": { "id": "...", "email": "...", "name": "..." }, "token": "<session_token>" }`

### C. Sign Out
- **URL**: `/api/auth/sign-out`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer <session_token>`
- **Success (`200 OK`)**: `{ "success": true }`

### D. Get Active Session
- **URL**: `/api/auth/get-session`
- **Method**: `GET`
- **Headers**: `Authorization: Bearer <session_token>`
- **Success (`200 OK`)**: `{ "session": { ... }, "user": { ... } }`

---

## 6. User Cloud Management Endpoints (`/api/v1/users/me`)

Protected endpoints requiring `Authorization: Bearer <token>`.

### A. Profile & Account
- **`GET /api/v1/users/me`**: Returns profile, cloud item counts, and preferences.
- **`DELETE /api/v1/users/me`**: Permanently deletes user account, cascading delete to all sessions, saved parking, recent searches, and preferences.

### B. Cloud Saved Parking
- **`GET /api/v1/users/me/saved-parking`**: Returns array of user's saved parking bookmarks (place IDs only).
- **`POST /api/v1/users/me/saved-parking`**:
  - Body: `{ "providerPlaceId": "ChIJb_28z_rkDDkR7Lh4jZ0Z_a0", "customName": "My Work Parking", "notes": "Level 2" }`
  - Upserts saved bookmark.
- **`DELETE /api/v1/users/me/saved-parking/:id`**: Deletes saved bookmark by its database record ID.

### C. Cloud Recent Searches
- **`GET /api/v1/users/me/recent-searches`**: Returns user's recent searches, chronologically sorted, max 10.
- **`POST /api/v1/users/me/recent-searches`**:
  - Body: `{ "query": "Connaught Place", "latitude": 28.6315, "longitude": 77.2167, "radiusMeters": 3000, "searchOriginType": "destination" }`
  - **Note**: Will be silently ignored if user has not opted into `recordRecentSearches`.
- **`DELETE /api/v1/users/me/recent-searches`**: Clears all recent searches for the authenticated user.

### D. User Preferences
- **`GET /api/v1/users/me/preferences`**: Retrieves user sync and privacy preferences.
- **`PATCH /api/v1/users/me/preferences`**:
  - Body: `{ "recordRecentSearches": true, "syncSavedParking": true, "defaultRadiusMeters": 3000 }`
  - Updates preferences.

---

## 7. Destination Search Endpoints (`/api/v1/places`)

Proxied Google Places Autocomplete & Details resolution.

### A. Autocomplete Predictions
- **URL**: `/api/v1/places/autocomplete`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "input": "Connaught Place",
    "sessionToken": "4bbd0541-69cb-4c57-897c-9b5cfb5fbc35",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "radiusMeters": 50000
  }
  ```
- **Success (`200 OK`)**:
  ```json
  {
    "data": [
      {
        "placeId": "ChIJb_28z_rkDDkR7Lh4jZ0Z_a0",
        "text": "Connaught Place, New Delhi, Delhi, India",
        "primaryText": "Connaught Place",
        "secondaryText": "New Delhi, Delhi, India"
      }
    ],
    "meta": { "count": 1, "sessionActive": true }
  }
  ```

### B. Destination Resolution
- **URL**: `/api/v1/places/resolve`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "placeId": "ChIJb_28z_rkDDkR7Lh4jZ0Z_a0",
    "sessionToken": "4bbd0541-69cb-4c57-897c-9b5cfb5fbc35"
  }
  ```
- **Success (`200 OK`)**:
  ```json
  {
    "data": {
      "placeId": "ChIJb_28z_rkDDkR7Lh4jZ0Z_a0",
      "name": "Connaught Place",
      "formattedAddress": "Connaught Place, New Delhi, Delhi 110001, India",
      "latitude": 28.6315,
      "longitude": 77.2167
    },
    "meta": { "sessionConcluded": true }
  }
  ```



---

## 8. Parking Photos & Visual Facility Details (`/api/v1/parking/:id/photos`)

Proxied Google Places API (New) Place Photos endpoints with SSRF protection and streaming media.

### A. Facility Photos Metadata
- **URL**: `/api/v1/parking/:id/photos`
- **Method**: `GET`
- **Authentication**: None (public / guest-accessible)
- **Parameters**:
  - `id` (path): Google Place ID (`places/ChIJ...`, `ChIJ...`, or `google:ChIJ...`)
- **Success (`200 OK`)**:
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

### B. Facility Photo Media Stream
- **URL**: `/api/v1/parking/:id/photos/:photoIndex/media`
- **Method**: `GET`
- **Authentication**: None (public / guest-accessible)
- **Parameters**:
  - `id` (path): Google Place ID
  - `photoIndex` (path): 0-indexed integer (0 to 4)
  - `maxWidth` (query, optional): integer (100–4800, default: 1200)
  - `maxHeight` (query, optional): integer (100–4800, default: 800)
- **Success (`200 OK`)**:
  - Headers:
    - `Content-Type`: `image/jpeg` (or image/*)
    - `Cache-Control`: `public, max-age=86400`
  - Body: Binary image stream

## Parking Intelligence discovery extension

The optional `mode` parameter on `GET /api/v1/parking/nearby` accepts `ALL_CANDIDATES`, `RECOMMENDED` or `VERIFIED_ONLY`. Explicit `sort=distance` wins in every mode. With display disabled, the response keeps the original shape and nearby ordering. With display enabled, each candidate and place details may contain `verification`, and nearby responses include `meta.intelligence`.

| Field | Meaning |
| --- | --- |
| `verification.facilityStatus` / `displayCategory` | `INDEPENDENTLY_VERIFIED`, `STRONGLY_SUPPORTED`, `UNCONFIRMED` or `CONTRADICTED` |
| `verification.access` | `PUBLIC`, `PRIVATE`, `CUSTOMERS_ONLY`, `RESTRICTED` or `UNKNOWN` |
| `verification.pricing` | `FREE`, `PAID` or `UNKNOWN`, from independent findings. Existing pricing fields still describe the provider option evidence. |
| `verification.operatingStatus` | `OPEN`, `CLOSED` or `UNKNOWN`, from the existing current provider status |
| `verification.reasonCodes`, `evidenceLevel`, `reviewRequired` | Sanitized policy explanations and review state |
| `verification.validUntil` | Optional UTC expiry of the evidence snapshot |
| `meta.intelligence` | Availability, filtering flag, default/effective mode, recommendation-ordered IDs, and an optional notice |

Notices are `FILTERING_DISABLED`, `VERIFICATION_UNAVAILABLE` or `NO_VERIFIED_PARKING`. The first two fall back to the original eligible candidate set in distance order. An enabled and available Verified Only query can return an empty set. Flutter requests All Candidates and applies backend-provided modes locally so view switches do not repeat the search. The [rollout guide](intelligence-rollout.md) lists flag interactions.
