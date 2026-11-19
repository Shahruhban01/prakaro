# Prakaro API Contract

This document defines the REST API endpoints provided by the **Prakaro API** service (`apps/api`).

---

## Global Standards

- **Base URL**: `/`
- **Default Format**: JSON (`Content-Type: application/json; charset=utf-8`)
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

```powershell
Invoke-RestMethod -Uri http://localhost:3000/health -Method GET | ConvertTo-Json
```

---

## 2. Parking Discovery API

### Discover Nearby Parking

Discovers parking facilities within a specified geographical bounding radius using the Google Places API (New) upstream provider. Results are normalized into Prakaro's clean client schema.

- **URL**: `/api/v1/parking/nearby`
- **Method**: `GET`
- **Authentication**: None (MVP phase; protected via backend rate limiting)
- **Rate Limit**: 60 requests per minute per IP address
- **Query Parameters**:

| Parameter | Type | Required | Range / Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `latitude` | `number` | **Yes** | `-90.0` to `90.0` | — | Latitude coordinate of the user's search center |
| `longitude`| `number` | **Yes** | `-180.0` to `180.0` | — | Longitude coordinate of the user's search center |
| `radius`   | `number` | No | `100` to `5000` | `3000` | Search bounding radius in meters (maximum: 5000) |

#### Success Response (`200 OK`)

```json
{
  "data": [
    {
      "id": "google:ChIJN1t_tDeuEmsRUsoyG83frY4",
      "name": "Sydney Opera House Parking",
      "latitude": -33.8568,
      "longitude": 151.2153,
      "address": "2A Macquarie St, Sydney NSW 2000, Australia",
      "source": "google"
    }
  ],
  "meta": {
    "count": 1,
    "radiusMeters": 3000
  }
}
```

*Note: If no parking facilities are detected within the bounding circle, the endpoint returns `200 OK` with an empty array: `{"data": [], "meta": {"count": 0, "radiusMeters": 3000}}`.*

#### Error Responses

##### `400 Bad Request` — Invalid Query Parameters
Returned when coordinates are missing, non-numeric, infinite, out of bounds, or radius is invalid (< 100 or > 5000).
```json
{
  "error": {
    "code": "INVALID_QUERY_PARAMS",
    "message": "Latitude must be between -90 and 90 degrees."
  }
}
```

##### `429 Too Many Requests` — Rate Limit Exceeded
Returned when a client exceeds 60 requests within a 1-minute window.
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  }
}
```

##### `502 Bad Gateway` — Upstream Provider Error
Returned when the upstream Google Places API encounters a network failure or returns an error status. Sensitive details and keys are never exposed.
```json
{
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "Unable to retrieve nearby parking locations."
  }
}
```

##### `503 Service Unavailable` — Service Not Configured
Returned when `GOOGLE_PLACES_API_KEY` has not been configured in the backend environment.
```json
{
  "error": {
    "code": "CONFIGURATION_ERROR",
    "message": "Parking discovery service is not configured. Missing Google Places API credentials."
  }
}
```

##### `504 Gateway Timeout` — Upstream Timeout
Returned when the upstream Google Places API does not respond within the 8-second timeout threshold.
```json
{
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "Google Places request timed out."
  }
}
```

##### `500 Internal Server Error` — Unexpected Error
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected internal error occurred."
  }
}
```

#### Example Usage

```bash
# Using curl (Default 3000m radius)
curl -X GET "http://localhost:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973"

# Using curl with custom 2500m radius
curl -X GET "http://localhost:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=2500"
```

```powershell
# Using PowerShell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=2500" -Method GET | ConvertTo-Json -Depth 5
```

---

## 3. Configuration & Google Places Setup Instructions

### Environment Variables
Configure in `apps/api/.env`:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GOOGLE_PLACES_API_KEY` | Yes (for parking) | Server-side API key for Google Cloud Places API (New) |
| `PORT` | No (Default: 3000) | Fastify HTTP port |
| `HOST` | No (Default: 0.0.0.0) | Interface binding |

### Google Cloud Console Setup Steps

1. **Create or Select a GCP Project**:
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/).
   - Create a project (e.g. `prakaro-dev`).
2. **Enable Places API (New)**:
   - In **APIs & Services > Library**, search for **Places API (New)**.
   - Click **Enable** (Ensure you enable the New API, endpoint: `places.googleapis.com`).
3. **Generate API Key**:
   - Navigate to **APIs & Services > Credentials**.
   - Click **Create Credentials > API Key**.
4. **Secure the API Key**:
   - Under **API restrictions**, choose **Restrict key** and check **Places API (New)** only.
   - Under **Application restrictions**, for backend servers select **IP addresses** (set your production server egress IP), or leave as **None** during local development.
   - **Never** distribute this key to the Flutter application or commit it to Git.
5. **Add to Local Environment**:
   - In `apps/api/.env`, assign the key:
     ```env
     GOOGLE_PLACES_API_KEY=AIzaSy...your-actual-key...
     ```
   - Restart the backend service.

---

## 4. Future Reserved Specifications

*The specifications below represent planned extensions for subsequent milestones (DB caching, photo storage via Cloudflare R2, facility detail retrieval).*

### Parking Facility Details (Planned)

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
