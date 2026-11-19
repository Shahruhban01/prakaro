# Prakaro Authentication Architecture — Better Auth & Mobile Integration

## 1. Overview
Prakaro uses **Better Auth** (v1.1+) as the primary authentication solution for user accounts, credential storage, and session lifecycle management. Rather than building a fragile custom JWT/refresh-token engine, Prakaro relies on Better Auth backed by **MySQL** via the official **Prisma adapter** and configured with the **Bearer Plugin** for mobile app authentication.

Prakaro adheres to a **Guest-First (Zero-Friction)** design: users can discover nearby parking, view maps, and explore destinations completely anonymously. Authentication is only required when saving parking facilities to the cloud or synchronizing cross-device preferences.

---

## 2. Architecture & Components

```mermaid
flowchart TD
    subgraph Flutter Mobile ["apps/mobile (Flutter)"]
        UI[Auth Screens & Modals]
        AR[AuthRepository]
        SS[SecureStorageService]
        AC[ApiClient + Interceptor]
    end

    subgraph Fastify API ["apps/api (Fastify + TypeScript)"]
        BACatchAll["/api/auth/* (Better Auth Plugin)"]
        AuthMid["requireAuth Middleware"]
        BAInstance["auth.api (Better Auth Engine)"]
    end

    subgraph Persistence ["Persistence Layer"]
        Prisma[Prisma ORM]
        MySQL[(MySQL 8+ Database)]
    end

    UI --> AR
    AR --> AC
    AR --> SS
    AC -- "Authorization: Bearer <token>" --> Fastify API
    BACatchAll --> BAInstance
    AuthMid --> BAInstance
    BAInstance --> Prisma
    Prisma --> MySQL
```

---

## 3. Better Auth Configuration

The Better Auth instance is configured in `apps/api/src/config/auth.ts`:

- **Database Adapter**: `@better-auth/prisma-adapter` connecting to MySQL via Prisma client (`db`).
- **Plugins**: `bearer()` from `better-auth/plugins` enables token-based authorization via `Authorization: Bearer <token>` headers, essential for mobile clients where cookie jars may not be shared across HTTP and native layers.
- **Email/Password**: Native email + password sign up and sign in enabled with min/max password validation.
- **Catch-All Handler**: Mounted at `/api/auth/*` in Fastify via:
  ```typescript
  app.all('/api/auth/*', async (request, reply) => {
    return auth.handler(toWebRequest(request));
  });
  ```
- **Session Verification**: The `requireAuth` middleware (`apps/api/src/common/middleware/auth.middleware.ts`) extracts the Bearer token or session headers and calls `auth.api.getSession({ headers })` to validate the session and inject `req.user` and `req.session` into the request context.

---

## 4. Endpoints

| Endpoint | Method | Description | Auth Required |
|---|---|---|---|
| `/api/auth/sign-up/email` | `POST` | Create account with email, name, password | No |
| `/api/auth/sign-in/email` | `POST` | Authenticate with email and password | No |
| `/api/auth/sign-out` | `POST` | Terminate session and invalidate Bearer token | Yes (Bearer) |
| `/api/auth/get-session` | `GET` | Retrieve authenticated user and session details | Yes (Bearer) |
| `/api/v1/users/me` | `GET` | Get profile, cloud counts, and sync preferences | Yes (Bearer) |
| `/api/v1/users/me` | `DELETE` | Delete account and cascade delete all cloud data | Yes (Bearer) |

---

## 5. Mobile Integration & Security

1. **Secure Storage**:
   - Mobile stores auth tokens in platform-native secure storage using `flutter_secure_storage` (Android Keystore / iOS Keychain).
   - Local SharedPreferences never store raw credentials or session tokens.
2. **Dio Network Interceptor**:
   - `ApiClient` inspects outgoing requests and automatically attaches `Authorization: Bearer <token>` when a token exists in `SecureStorageService`.
   - On HTTP 401 Unauthorized, `ApiClient` emits a session expired signal, clearing the token and notifying the UI to prompt re-login.
3. **Guest Mode Preservation**:
   - Guests browse without restriction.
   - Tapping the "Save" bookmark button as a guest triggers an `AuthPromptBottomSheet` explaining cloud-sync benefits, with options to "Sign In", "Create Account", or "Continue as Guest" (saving locally only).
4. **Local-to-Cloud Migration**:
   - When a guest signs in or creates an account, `LocalMigrationDialog` detects bookmarks stored locally in `SharedPreferences` and offers a one-tap batch migration to the user's cloud account.
