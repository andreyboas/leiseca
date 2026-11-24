# Security Specification — Lei Seca (Firestore Rules)

## 1. Data Invariants
1. **Default-Deny Baseline**: Any path outside `/users/{userId}` must deny all reads and writes.
2. **Verified Identity Gate**: Only authenticated users whose `request.auth.token.email_verified == true` may read or write their own `/users/{userId}` document.
3. **Strict PII Isolation**: No user may `get` or `list` another user's `/users/{userId}` document; `list` on `/users` is explicitly disabled.
4. **Immutable Ownership & Provenance**: `uid`, `email`, `provider`, and `createdAt` cannot be modified after creation.
5. **Server Timestamp Integrity**: `createdAt` and `updatedAt` must equal `request.time`.
6. **Strict Schema Enforcement**: Shadow/ghost fields, oversized strings, and non-matching UIDs must be rejected on both `create` and `update`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Unauthenticated read**: `get /users/user_1` with `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified email create**: `create /users/user_1` with `auth.uid = "user_1"`, `auth.token.email_verified = false` -> `PERMISSION_DENIED`.
3. **Cross-user PII read**: `get /users/user_2` with `auth.uid = "user_1"`, `email_verified = true` -> `PERMISSION_DENIED`.
4. **Collection scraping (`list`)**: `list /users` with `auth.uid = "user_1"`, `email_verified = true` -> `PERMISSION_DENIED`.
5. **Identity spoofing**: `create /users/user_1` with payload `{ uid: "user_2", ... }` -> `PERMISSION_DENIED`.
6. **Email spoofing**: `create /users/user_1` with payload `{ email: "admin@evil.com" }` where `auth.token.email = "user1@gmail.com"` -> `PERMISSION_DENIED`.
7. **Shadow / ghost field injection**: `create /users/user_1` with valid fields plus `{ isAdmin: true }` -> `PERMISSION_DENIED`.
8. **Shadow key on update**: `update /users/user_1` modifying `role: "admin"` -> `PERMISSION_DENIED`.
9. **Immutable field mutation (`provider` / `createdAt`)**: `update /users/user_1` changing `provider` or `createdAt` -> `PERMISSION_DENIED`.
10. **Client-forged timestamp**: `create /users/user_1` with `createdAt` != `request.time` -> `PERMISSION_DENIED`.
11. **ID Poisoning**: `create /users/invalid$id..` (non-matching `^[a-zA-Z0-9_\-]+$` or >128 chars) -> `PERMISSION_DENIED`.
12. **Value poisoning / oversized string**: `update /users/user_1` with `displayName` > 120 chars or `photoURL` > 500 chars -> `PERMISSION_DENIED`.
