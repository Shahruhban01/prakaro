# Local Development Guide (Windows Focus)

This guide documents environment setup, execution procedures, and troubleshooting guidelines for developing **Prakaro** on Windows 11/10.

---

## 1. Prerequisites & Tooling

| Component | Minimum Version | Verified Active Version |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (LTS) | `v20.20.2` |
| **npm** | `>= 10.0.0` | `10.8.2` |
| **Flutter SDK** | `>= 3.22.0` (Stable) | `3.44.0` |
| **Dart SDK** | `>= 3.4.0` | `3.12.0` |
| **Android SDK** | API Level 34+ | SDK 36.1.0 |
| **JDK** | JDK 17+ | OpenJDK 17 |

---

## 2. Backend Setup (`apps/api`)

### Installation & Compilation
From the workspace root or the `apps/api` directory:

```powershell
# From root workspace
npm run api:install
npm run api:build

# Or directly in apps/api
cd apps/api
npm install
npm run build
```

### Environment Configuration
Copy `.env.example` to `.env`:

```powershell
cd apps/api
Copy-Item .env.example .env
```

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | No | `development` |
| `PORT` | HTTP port | No | `3000` |
| `HOST` | Binding interface host (`0.0.0.0` binds to all local interfaces) | No | `0.0.0.0` |
| `GOOGLE_PLACES_API_KEY` | Server-side Google Places API (New) key | Yes (for parking & places) | `""` |
| `DATABASE_URL` | MySQL connection string (`mysql://user:pass@127.0.0.1:3306/prakaro_db`) | Yes | — |
| `BETTER_AUTH_SECRET` | Secret encryption key for Better Auth tokens and sessions | Yes | (32-char secret) |
| `BETTER_AUTH_URL` | Base URL for Better Auth authentication routing | No | `http://localhost:3000` |

### Database & Prisma Setup
Prakaro uses MySQL 8+ (e.g. standard MySQL or XAMPP MySQL) and Prisma ORM:

```powershell
# 1. Start your local MySQL service (e.g., via XAMPP Control Panel or MySQL service)
# 2. Create the development and test databases in MySQL:
#    CREATE DATABASE prakaro_db;
#    CREATE DATABASE prakaro_test_db;

# 3. Generate Prisma client & push schema
cd apps/api
npx prisma generate
npx prisma db push

# For test database schema push:
$env:DATABASE_URL="mysql://root:@127.0.0.1:3306/prakaro_test_db"; npx prisma db push
```

### Running the Server
```powershell
# Development mode with hot-reloading (via tsx)
npm run api:dev

# Or production build & start
npm run api:build
npm run api:start
```

### Verification
```powershell
# Health check endpoint
Invoke-RestMethod -Uri http://127.0.0.1:3000/health

# Parking discovery endpoint (requires GOOGLE_PLACES_API_KEY)
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&radius=3000"

# Filtered discovery queries (pricing, openNow, access, sort)
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&pricing=free"
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/parking/nearby?latitude=34.0837&longitude=74.7973&openNow=true"

# Stage B on-demand single facility details
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/parking/google:ChIJZVma6EOP4TgRxagbQBLFB64"
```

---

## 3. Mobile Setup & Google Maps Configuration (`apps/mobile`)

### A. Google Maps Android SDK Setup

1. **Enable Maps SDK for Android**:
   - Open [Google Cloud Console](https://console.cloud.google.com/).
   - Go to **APIs & Services > Library**.
   - Search for **Maps SDK for Android** and click **Enable**.
2. **Generate and Restrict the Android API Key**:
   - Navigate to **APIs & Services > Credentials > Create Credentials > API Key**.
   - Under **API restrictions**, select **Restrict key** and check **Maps SDK for Android** only.
   - Under **Application restrictions**, select **Android apps**.
   - Add your package name: `com.prakaro.app`.
   - Add your debug SHA-1 certificate fingerprint.
3. **Obtain Debug SHA-1 Fingerprint on Windows**:
   ```powershell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```
   Look for the `SHA1:` line (e.g., `DA:39:A3:EE:...`).
4. **Configure the Key Locally**:
   Add `MAPS_API_KEY` to `apps/mobile/android/local.properties` (which is git-ignored):
   ```properties
   MAPS_API_KEY=AIzaSyYourAndroidMapsSdkKey...
   ```
   Or set the environment variable:
   ```powershell
   $env:MAPS_API_KEY="AIzaSyYourAndroidMapsSdkKey..."
   ```
   The Gradle build configuration in `apps/mobile/android/app/build.gradle.kts` automatically injects this value into `AndroidManifest.xml` via `manifestPlaceholders["mapsApiKey"]`.

### B. Dependency Installation & Tests
```powershell
cd apps/mobile
flutter pub get

# Run static analysis
flutter analyze

# Run all automated tests
flutter test
```

---

## 4. Connecting Mobile to Backend

Because mobile apps run in sandboxed virtual environments or physical hardware, `localhost` refers to the mobile device itself, not your Windows development host.

### A. Android Emulator Networking
The default Android emulator loopback alias to the host machine is `10.0.2.2`.

```powershell
cd apps/mobile
flutter run -d <emulator-id> --dart-define=API_BASE_URL=http://10.0.2.2:3000
```
*(The default `AppConfig.apiBaseUrl` in `lib/core/config/app_config.dart` already defaults to `http://10.0.2.2:3000`)*.

### B. Physical Android Device Networking
When using a physical Android device connected via USB or Wi-Fi:

1. Identify your Windows machine's local network IP:
   ```powershell
   ipconfig
   # Look for IPv4 Address under your active Wi-Fi or Ethernet adapter (e.g., 192.168.1.50)
   ```
2. Verify both the Windows machine and your Android phone are on the same Wi-Fi network.
3. Allow incoming connections to port 3000 in Windows Firewall if blocked:
   ```powershell
   New-NetFirewallRule -DisplayName "Prakaro API Dev 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
4. Run the Flutter app passing your LAN IP:
   ```powershell
   cd apps/mobile
   flutter run -d <device-id> --dart-define=API_BASE_URL=http://192.168.1.50:3000
   ```
5. **Alternative via ADB reverse** (USB tethered):
   Forward the device port to the host:
   ```powershell
   adb reverse tcp:3000 tcp:3000
   flutter run -d <device-id> --dart-define=API_BASE_URL=http://localhost:3000
   ```

---

## 5. Running Backend and Mobile Together

To test live parking discovery end-to-end:

### Terminal 1: Backend
```powershell
# In workspace root
npm run api:dev
```
Verify the server starts and logs:
`Prakaro API server listening at http://0.0.0.0:3000`

### Terminal 2: Flutter App
```powershell
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

1. The app boots with the **Parking List View** as the default home screen.
2. An Android location dialog will request foreground location access.
3. Upon granting permission, Prakaro queries `GET /api/v1/parking/nearby` on your backend.
4. Nearby parking locations appear as polished cards sorted by ascending straight-line distance.
5. Tap **Directions** on any card to launch external navigation.
6. Toggle the **List / Map** view switcher at any time to inspect locations on the interactive Google Map with markers and "Search this area" support without triggering duplicate network queries.

---

## 6. Common Troubleshooting Scenarios

### 1. Google Map Shows Blank Grid (No Tiles)
- Ensure the **Maps SDK for Android** is enabled in your Google Cloud project.
- Check that `MAPS_API_KEY` is defined in `apps/mobile/android/local.properties`.
- Check that your package name (`com.prakaro.app`) and debug SHA-1 fingerprint match the key's restriction settings in Google Cloud Console.

### 2. `Some Android licenses not accepted`
Run the license manager and accept prompts:
```powershell
flutter doctor --android-licenses
```

### 3. Backend Fails with `CONFIGURATION_ERROR` (503)
The backend does not have `GOOGLE_PLACES_API_KEY` defined in `apps/api/.env`. Set your Places API key in `apps/api/.env` and restart the backend.

### 4. Flutter `Connection refused` When Invoking API
- Check if backend is bound to `0.0.0.0` (not strictly `127.0.0.1`).
- Ensure emulator uses `10.0.2.2:3000` instead of `localhost:3000`.
- Verify Windows Defender Firewall is not blocking the Node process on private networks.

---

## 7. Google Places Usage Monitoring & Cost Estimation

### Monitoring Upstream API Calls
To inspect live upstream Google Places request counts during local development, query the diagnostics endpoint:
```powershell
curl http://localhost:3000/api/v1/parking/metrics
```
This returns in-process counters tracking:
- `nearbySearch`: Total search attempts, successes, failures, timeouts, 429 rate limits, and success rate percentage.
- `placeDetails`: Total single-facility details attempts, successes, and failures.
- `totals`: Cumulative upstream HTTP requests and average request duration.
- `fieldMasks`: Active minimal field masks for Nearby Search and Place Details.

### Cost Calculation & Billing Guidelines
Google Places API (New) charges per 1,000 requests based on the requested field mask:
- **Nearby Search (Basic/Pro)**: Approximately $32 to $35 per 1,000 requests depending on field tier.
- **Place Details (Basic/Pro)**: Approximately $17 to $25 per 1,000 requests.
- **Monthly Free Allowance**: Google Cloud provides a recurring $200 monthly credit, covering approximately 5,700–6,200 Nearby Search requests each month.

**Cost Safety Protections Implemented in Prakaro**:
1. Client-side debouncing (350 ms) prevents rapid radius toggling from firing multiple upstream requests.
2. In-flight request coalescing shares simultaneous identical searches.
3. List/Map view switching causes **zero** network requests.
4. Local filters (Free, Paid, Open Now, Public Access) filter in-memory candidate sets without calling Google Places again.
5. Place Details are queried **only** when specifically requested for a single facility (Stage B), never prefetched in bulk.
6. Persistent caching of Places content is strictly omitted in compliance with Google Maps Platform terms of service.

---

## 8. Saved Parking & Local Storage Testing (Milestone 09A)

Milestone 09A introduces local persistence for bookmarked parking facilities and recent search origins via `shared_preferences`.

### Storage Keys & Schemas
- `prakaro_storage_version`: Integer schema version (`1`).
- `prakaro_saved_parking_refs`: JSON array of `SavedParkingRef` (`[{ "id": "google:ChIJ...", "provider": "google", "providerPlaceId": "ChIJ...", "savedAt": "..." }]`). Stored references contain **zero** Google Places content.
- `prakaro_recent_searches`: JSON array of `RecentSearch` (`[{ "id": "...", "latitude": 34.08, "longitude": 74.79, "radiusMeters": 3000, "createdAt": "...", "originType": "explicitAreaSearch", "label": "Previously searched area" }]`).
- `prakaro_recent_search_recording_enabled`: Boolean flag (**defaults to `false`** for privacy).

### Clearing Local Storage During Testing
In Flutter tests or development:
- From within the app: Navigate to the **Saved** tab, tap **Clear all** under Saved Facilities or Recent Searches.
- From ADB:
  ```powershell
  adb shell pm clear com.prakaro.app
  ```
- In automated unit tests:
  ```dart
  SharedPreferences.setMockInitialValues({});
  ```
