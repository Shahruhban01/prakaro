# Prakaro

> Parking discovery, simplified.

**Prakaro** is an Android-first mobile application that enables users to effortlessly discover nearby parking facilities in real-time. The system implements a **strictly backend-driven architecture**, ensuring client lightweightness, centralized business logic, and airtight security for third-party commercial API credentials.

---

## Technology Stack

- **Mobile Application**:
  - [Flutter](https://flutter.dev/) (Channel stable, 3.44+)
  - [Dart](https://dart.dev/) (3.12+)
  - [Riverpod](https://riverpod.dev/) (v3.5+ State Management)
  - [Dio](https://pub.dev/packages/dio) (v5.11+ HTTP Client)
  - [Material 3](https://m3.material.io/)
- **Backend API Service**:
  - [Node.js](https://nodejs.org/) (v20+ LTS)
  - [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
  - [Fastify](https://fastify.dev/) (v4.28+)
  - [Zod](https://zod.dev/) (Environment & Contract Validation)
  - [ESLint](https://eslint.org/) (v9 Flat Config) & [Prettier](https://prettier.io/)
- **Database & Persistence (Reserved)**:
  - MySQL 8+
  - [Prisma ORM](https://www.prisma.io/) (v5.22+)

---

## Repository Structure

```
prakaro/
├── apps/
│   ├── mobile/                               # Flutter Android-first mobile application
│   │   ├── android/                          # Native Android platform host
│   │   ├── lib/
│   │   │   ├── app/                          # App root & placeholder UI
│   │   │   ├── core/                         # Shared core infrastructure
│   │   │   │   ├── config/                   # Compile-time app config & Dart defines
│   │   │   │   ├── errors/                   # App exceptions & network errors
│   │   │   │   ├── network/                  # Dio ApiClient & HTTP interceptors
│   │   │   │   └── theme/                    # Material 3 light/dark theme definitions
│   │   │   ├── features/
│   │   │   │   └── parking/                  # Parking feature domain slices
│   │   │   │       ├── data/                 # Repositories & DTOs
│   │   │   │       ├── domain/               # Domain models & interfaces
│   │   │   │       └── presentation/         # View widgets & Riverpod providers
│   │   │   └── main.dart                     # App entry point (ProviderScope root)
│   │   ├── test/                             # Flutter widget & unit tests
│   │   └── pubspec.yaml
│   │
│   └── api/                                  # Fastify TypeScript backend service
│       ├── prisma/                           # Database schema definitions
│       │   └── schema.prisma
│       ├── src/
│       │   ├── common/                       # Centralized errors & middleware
│       │   │   ├── errors/
│       │   │   └── middleware/
│       │   ├── config/                       # Zod-validated environment config
│       │   ├── integrations/                 # Google Places & R2 external adapters
│       │   ├── modules/
│       │   │   └── parking/                  # Parking search domain & controllers
│       │   ├── app.ts                        # Fastify application factory
│       │   └── server.ts                     # Server entry point & graceful shutdown
│       ├── tests/                            # API integration tests
│       ├── .env.example                      # Sample environment variables
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   ├── architecture.md                       # Architectural principles & boundaries
│   ├── development.md                        # Local Windows development guide
│   └── api-contract.md                       # REST API specification
├── .editorconfig                             # Cross-editor formatting standards
├── .gitignore                                # Comprehensive root gitignore
├── package.json                              # Workspace root scripts
└── README.md
```

---

## Prerequisites

- **Node.js**: `v20.x` LTS or newer
- **npm**: `v10.x` or newer
- **Flutter SDK**: `3.22.x` (or newer stable release, e.g. `3.44.0`)
- **Android SDK & Toolchain**: Android API 34+ and Command-line Tools / Android Studio
- **Git**

---

## Quick Start & Installation

### 1. Clone the repository
```powershell
git clone <repo-url> prakaro
cd prakaro
```

### 2. Install Dependencies

```powershell
# Install backend dependencies from root
npm run api:install

# Install mobile dependencies
cd apps/mobile
flutter pub get
cd ../..
```

---

## How to Start the Backend

### Environment Configuration
Create the local `.env` file from `.env.example`:

```powershell
cd apps/api
Copy-Item .env.example .env
```

### Running the Backend

```powershell
# Development mode with hot reload (from root)
npm run api:dev

# Or production build & start
npm run api:build
npm run api:start
```

The API will bind by default to `http://0.0.0.0:3000`.

### Health Check Verification
```powershell
curl http://localhost:3000/health
# Output: {"status":"ok","service":"prakaro-api"}
```

---

## How to Run Flutter

### Running on Android Emulator
```powershell
cd apps/mobile
flutter run -d <emulator-id> --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

### Running on Physical Android Device
Ensure your phone and computer share the same local network:
```powershell
cd apps/mobile
flutter run -d <device-id> --dart-define=API_BASE_URL=http://<YOUR_COMPUTER_LAN_IP>:3000
```

### Running on Windows Desktop (Quick UI testing)
```powershell
cd apps/mobile
flutter run -d windows --dart-define=API_BASE_URL=http://localhost:3000
```

---

## Quality & Verification Commands

| Command | Description |
| :--- | :--- |
| `npm run api:build` | Compiles TypeScript backend in strict mode |
| `npm run api:lint` | Runs ESLint across the backend codebase |
| `npm run api:format` | Formats backend code with Prettier |
| `npm run api:test` | Executes backend test suite (Fastify health test) |
| `flutter analyze` | Runs Dart analyzer across the mobile app |
| `flutter test` | Executes Flutter unit & widget tests |

---

## Documentation Links

- [Architecture Overview](file:///e:/JustAnotherFuckinProject/docs/architecture.md)
- [Development & Networking Guide](file:///e:/JustAnotherFuckinProject/docs/development.md)
- [API Contract Specification](file:///e:/JustAnotherFuckinProject/docs/api-contract.md)
