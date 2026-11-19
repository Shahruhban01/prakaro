# Prakaro API Contract

This document defines the REST API endpoints provided by the **Prakaro API** service (`apps/api`).

---

## Global Standards

- **Base URL**: `/`
- **Default Format**: JSON (`Content-Type: application/json; charset=utf-8`)
- **Error Format**:
  ```json
  {
    "error": "ErrorType",
    "message": "Human readable description of the error",
    "details": null
  }
  ```

---

## 1. System Endpoints

### Health Check

Returns the operational status and service identifier of the backend instance.

- **URL**: `/health`
- **Method**: `GET`
- **Authentication**: None
- **Response Headers**:
  - `Content-Type: application/json; charset=utf-8`

#### Success Response (`200 OK`)

```json
{
  "status": "ok",
  "service": "prakaro-api"
}
```

#### Example Usage

```bash
curl -i -X GET http://localhost:3000/health
```

---

## 2. Parking Discovery API (Reserved Specification)

*Note: Parking discovery endpoints are slated for subsequent implementation phases. The preliminary schema specification below outlines the agreed contract for client-server integration.*

### Discover Nearby Parking

Retrieves parking facilities within a specified geographical bounding radius of the user's coordinates.

- **URL**: `/api/v1/parking/nearby`
- **Method**: `GET`
- **Authentication**: Bearer / Client Session Token (Future)
- **Query Parameters**:
  | Parameter | Type | Required | Description | Example |
  | :--- | :--- | :--- | :--- | :--- |
  | `latitude` | `number` (float) | Yes | User latitude coordinate (-90 to 90) | `12.9716` |
  | `longitude`| `number` (float) | Yes | User longitude coordinate (-180 to 180)| `77.5946` |
  | `radius`   | `number` (integer) | No | Search radius in meters (default: 2000, max: 10000) | `2500` |

#### Planned Success Response (`200 OK`)

```json
{
  "data": [
    {
      "id": "prk_01HZX879ABCDEF123456",
      "name": "MG Road Central Parking",
      "address": "12 Mahatma Gandhi Rd, Bengaluru, Karnataka",
      "location": {
        "latitude": 12.9721,
        "longitude": 77.5952
      },
      "distanceMeters": 140,
      "totalSpots": 80,
      "availableSpots": 24,
      "hourlyRate": {
        "amount": 50.0,
        "currency": "INR"
      },
      "photos": [
        "https://r2.prakaro.internal/photos/parking_01_a.jpg"
      ],
      "source": "google_places_hybrid"
    }
  ],
  "meta": {
    "count": 1,
    "timestamp": "2026-11-19T10:00:00.000Z"
  }
}
```

### Parking Facility Details

Retrieves comprehensive metadata for a specific parking facility.

- **URL**: `/api/v1/parking/:id`
- **Method**: `GET`
- **URL Parameters**:
  - `id`: Unique parking facility identifier

#### Planned Success Response (`200 OK`)

```json
{
  "data": {
    "id": "prk_01HZX879ABCDEF123456",
    "name": "MG Road Central Parking",
    "address": "12 Mahatma Gandhi Rd, Bengaluru, Karnataka",
    "location": {
      "latitude": 12.9721,
      "longitude": 77.5952
    },
    "operatingHours": {
      "open24Hours": true
    },
    "amenities": [
      "covered",
      "cctv",
      "ev_charging"
    ],
    "hourlyRate": {
      "amount": 50.0,
      "currency": "INR"
    }
  }
}
```
