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

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | `development` |
| `PORT` | HTTP port | `3000` |
| `HOST` | Binding interface host (`0.0.0.0` binds to all local interfaces) | `0.0.0.0` |
| `DATABASE_URL` | MySQL connection string (reserved for future migration) | Optional at initial startup |
| `GOOGLE_PLACES_API_KEY` | Google Places API secret (reserved) | Optional at initial startup |

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
# Test health check endpoint
Invoke-RestMethod -Uri http://127.0.0.1:3000/health
```

---

## 3. Flutter & Android Setup (`apps/mobile`)

### Dependency Installation
```powershell
cd apps/mobile
flutter pub get
```

### Static Analysis & Unit Tests
```powershell
# Run code analysis
flutter analyze

# Run unit and widget tests
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
5. **Alternative via ADB reverse**:
   If connected over USB, forward the device port to host:
   ```powershell
   adb reverse tcp:3000 tcp:3000
   flutter run -d <device-id> --dart-define=API_BASE_URL=http://localhost:3000
   ```

### C. Desktop / Web Development
```powershell
cd apps/mobile
flutter run -d windows --dart-define=API_BASE_URL=http://localhost:3000
```

---

## 5. Common Troubleshooting Scenarios

### 1. `Some Android licenses not accepted`
Run the license manager and accept prompts:
```powershell
flutter doctor --android-licenses
```

### 2. Backend Fails to Start with `EADDRINUSE`
Port 3000 is occupied by another process:
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```
Or change `PORT=3001` in `apps/api/.env`.

### 3. Flutter `Connection refused` When Invoking API
- Check if backend is bound to `0.0.0.0` (not strictly `127.0.0.1`).
- Ensure emulator uses `10.0.2.2:3000` instead of `localhost:3000`.
- Verify Windows Defender Firewall is not blocking the Node process on private networks.
