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

Retrieves deep details for a specific parking facility on demand. This avoids uncontrolled upstream requests by only fetching details when a user inspects a facility.

- **URL**: `/api/v1/parking/:id`
- **Method**: `GET`
- **Authentication**: None
- **Rate Limit**: 60 requests per minute per IP address
- **URL Parameters**:
  - `id`: Unique facility identifier (e.g., `google:ChIJZVma6EOP4TgRxagbQBLFB64`).

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
      "searchFieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.parkingOptions,places.currentOpeningHours",
      "detailsFieldMask": "id,displayName,formattedAddress,location,businessStatus,parkingOptions,currentOpeningHours,regularOpeningHours"
    },
    "costEstimation": {
      "note": "Estimated costs depend on active Google Cloud Platform billing SKU rates and free tier credits ($200 monthly allowance). Multiply billable requests by current regional SKU rate.",
      "nearbySearchSku": "Places API (New) - Nearby Search (Pro/Enterprise based on field mask)",
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
| `404 Not Found` | `NOT_FOUND` | Facility ID not found |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Request threshold exceeded |
| `502 Bad Gateway` | `UPSTREAM_ERROR` | Google Places API error |
| `503 Service Unavailable` | `CONFIGURATION_ERROR` | Server missing Google Places API key |
| `504 Gateway Timeout` | `UPSTREAM_TIMEOUT` | Google Places request timed out |
