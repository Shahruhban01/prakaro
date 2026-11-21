# Prakaro

> Parking discovery, simplified.

**Prakaro** is an Android-first mobile application that enables users to effortlessly discover nearby parking facilities in real time. The system implements a **strictly backend-driven architecture**, ensuring client lightweightness, centralized business logic, and airtight security for commercial third-party API credentials.

---

## Technology Stack

- **Mobile Application (`apps/mobile`)**:
  - [Flutter](https://flutter.dev/) (Channel stable, 3.44+) & [Dart](https://dart.dev/) (3.12+)
  - [Google Maps Flutter](https://pub.dev/packages/google_maps_flutter) (Map viewport, camera control & custom markers)
  - [Geolocator](https://pub.dev/packages/geolocator) (Foreground GPS location & permissions)
  - [URL Launcher](https://pub.dev/packages/url_launcher) (External navigation dispatch)
  - [Riverpod](https://riverpod.dev/) (v3.5+ State Management via `Notifier`)
  - [Dio](https://pub.dev/packages/dio) (v5.11+ HTTP Client)
  - [Material 3](https://m3.material.io/)
- **Backend API Service (`apps/api`)**:
  - [Node.js](https://nodejs.org/) (v20+ LTS) & [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
  - [Fastify](https://fastify.dev/) (v4.28+)
  - [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/op-overview)
  - [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) (Endpoint throttling)
  - [Zod](https://zod.dev/) (Environment & Contract Validation)
  - [ESLint](https://eslint.org/) (v9 Flat Config) & [Prettier](https://prettier.io/)
- **Database & Persistence**:
  - MySQL 8+ & [Prisma ORM](https://www.prisma.io/)
- **Authentication**:
  - [Better Auth](https://www.better-auth.com/) with Bearer Plugin & Prisma adapter

---

## Repository Structure

```
prakaro/
├── apps/
│   ├── mobile/                               # Flutter Android-first mobile application
│   │   ├── android/                          # Native Android platform host
│   │   │   ├── app/
│   │   │   │   ├── build.gradle.kts          # Injects mapsApiKey, app ID: com.prakaro.app
│   │   │   │   └── src/main/AndroidManifest.xml # Permissions & Google Maps meta-data
│   │   ├── lib/
│   │   │   ├── app/                          # PrakaroApp root widget
│   │   │   ├── core/                         # Shared core infrastructure
│   │   │   │   ├── config/                   # Compile-time app config & Dart defines
│   │   │   │   ├── errors/                   # AppException & NetworkException
│   │   │   │   ├── network/                  # Dio ApiClient, Bearer token interceptor, 401 handling
│   │   │   │   ├── storage/                  # SecureStorageService (FlutterSecureStorage) & LocalStorageService
│   │   │   │   ├── services/                 # LocationService (GPS) & NavigationService
│   │   │   │   └── theme/                    # Material 3 light/dark theme definitions
│   │   │   ├── features/
│   │   │   │   ├── auth/                     # Milestone 10 Better Auth module
│   │   │   │   │   ├── data/                 # AuthRepository & AuthRemoteDataSource
│   │   │   │   │   ├── domain/               # AppUser, UserPreferences & AuthState
│   │   │   │   │   └── presentation/         # Login, Register, Profile, Welcome, Guest prompt dialogs
│   │   │   │   └── parking/                  # Parking feature domain slices
│   │   │   │       ├── data/                 # ParkingRemoteDataSource, PlacesRemoteDataSource
│   │   │   │       ├── domain/               # ParkingLocation, DestinationSuggestion, ResolvedDestination
│   │   │   │       └── presentation/         # ParkingHomeScreen, ParkingListScreen (Default),
│   │   │   │                                 # ParkingMapScreen, DestinationSearchScreen, SavedParkingScreen,
│   │   │   │                                 # ParkingViewSwitcher, ParkingCard, ParkingFilterBar, ParkingRadiusSelector
│   │   │   └── main.dart                     # App entry point (ProviderScope root)
│   │   ├── test/                             # Unit, repository, filter, radius, widget & auth tests (102 tests)
│   │   └── pubspec.yaml
│   │
│   └── api/                                  # Fastify TypeScript backend service
│       ├── prisma/                           # Database schema definitions (Better Auth + Prakaro models)
│       │   └── schema.prisma
│       ├── src/
│       │   ├── common/                       # Centralized errors, middleware (requireAuth), database (prisma)
│       │   ├── config/                       # Zod-validated environment config & Better Auth config
│       │   ├── integrations/
│       │   │   └── google-places/            # Google Places API client (Nearby, Autocomplete, Details) & mapper
│       │   ├── modules/
│       │   │   ├── parking/                  # Parking discovery routes & controller
│       │   │   ├── places/                   # Milestone 10 destination autocomplete & resolve proxy
│       │   │   └── user/                     # Milestone 10 cloud saved parking, recent searches & preferences
│       │   ├── app.ts                        # Fastify application factory (/api/auth/* catch-all)
│       │   └── server.ts                     # Server entry point & graceful shutdown
│       ├── tests/                            # API integration tests (35 tests: health, parking, auth-and-cloud)
│       ├── .env.example                      # Sample environment variables
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── architecture.md                       # Architectural principles & boundaries
│   ├── authentication.md                     # Better Auth, Bearer plugin & mobile lifecycle
│   ├── database.md                           # MySQL schema, Prisma models & Google compliance
│   ├── destination-search.md                 # Destination search architecture & session token proxy
│   ├── development.md                        # Local Windows development & networking guide
│   └── api-contract.md                       # REST API specification & setup guide
├── .editorconfig                             # Cross-editor formatting standards
├── .gitignore                                # Comprehensive root gitignore
├── package.json                              # Workspace root scripts
└── README.md
```

---

## Quick Start & Installation

### 1. Install Backend Dependencies
```powershell
npm run api:install
npm run api:build
```

### 2. Configure Backend Environment
```powershell
cd apps/api
Copy-Item .env.example .env
# Open .env and add your GOOGLE_PLACES_API_KEY
```

### 3. Install Mobile Dependencies
```powershell
cd apps/mobile
flutter pub get
```

### 4. Configure Android Maps API Key
Add your Android-restricted Google Maps key to `apps/mobile/android/local.properties`:
```properties
MAPS_API_KEY=AIzaSyYourAndroidMapsSdkKey...
```

---

## How to Run Backend and Mobile Together

### Step 1: Start the Backend API
```powershell
# From workspace root
npm run api:dev
```
The server will start listening at `http://0.0.0.0:3000`.

### Step 2: Run Flutter on Android
```powershell
# Running on Android Emulator
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000

# Running on Physical Android Device (over Wi-Fi)
flutter run --dart-define=API_BASE_URL=http://<YOUR_COMPUTER_LAN_IP>:3000
```

---

## Quality & Verification Commands

| Command | Description |
| :--- | :--- |
| `npm run api:build` | Compiles TypeScript backend in strict mode |
| `npm run api:lint` | Runs ESLint across the backend codebase |
| `npm run api:test` | Runs backend tests, including mocked Gemini and MySQL-backed auth tests |
| `flutter analyze` | Runs Dart static analysis across the mobile codebase (0 issues) |
| `flutter test` | Executes Flutter unit, DTO, repository, filter, radius, concurrency, saved parking, and photo gallery widget tests (113 tests) |
| `flutter build apk --debug` | Verifies full native Android APK compilation |

---

## Documentation Links

- [Parking Intelligence and reviewer workflow](docs/parking-intelligence.md)
- [Milestone 12B evaluation](docs/intelligence-evaluation.md)
- [Controlled rollout and rollback](docs/intelligence-rollout.md)
- [Architecture Overview](file:///e:/JustAnotherFuckinProject/docs/architecture.md)
- [Development & Networking Guide](file:///e:/JustAnotherFuckinProject/docs/development.md)
- [API Contract Specification](file:///e:/JustAnotherFuckinProject/docs/api-contract.md)
- [Parking Photos & Visual Details](file:///e:/JustAnotherFuckinProject/docs/parking-photos.md)

To activate verification locally on Android, use the [development profile, device connection and pilot reviewer workflow](docs/parking-intelligence.md#local-pilot-on-an-android-device).
