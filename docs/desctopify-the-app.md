# Desktop-App Blueprint

**Next .js 15.3 × Tauri v2**

---

## 1 High-Level Architecture

| Layer                  | Tech                                        | Responsibilities                              | Why it’s Safe / Lean                                     |
| ---------------------- | ------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| **WebView (Renderer)** | Static-exported Next .js pages, React 18    | UI, user interaction                          | Runs in a sandbox; no Node or FS rights                  |
| **Tauri Core (Rust)**  | Tauri runtime + plugins                     | Filesystem, HTTP, SQLite, auto-update, crypto | Memory-safe, OS-level permissions, small footprint       |
| **Resources**          | Bundled assets (`out/`, optional `seed.db`) | Read-only installer contents                  | Signed and hashed at build time                          |
| **User data folder**   | `BaseDirectory.AppConfig`                   | Writable SQLite DB, config, cache             | Outside read-only install dir; auto-cleaned on uninstall |

---

## 2 Build & Bundling Strategy

### 2.1 Static Export

```js
// next.config.js
module.exports = { output: 'export' };
```

* No runtime Node server
* Works with Client Components, RSC rendered at build

### 2.2 Filesystem Access

Install once:

```bash
pnpm add @tauri-apps/plugin-fs
```

Then in a Client Component:

```ts
import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
const text = await readTextFile('settings.json', { dir: BaseDirectory.AppConfig });
```

---

## 3 SQLite Integration

### 3.1 Plugin Setup

```bash
cargo add tauri-plugin-sql --features sqlite
pnpm add @tauri-apps/plugin-sql
```

Rust bootstrap:

```rust
tauri::Builder::default()
  .plugin(
    tauri_plugin_sql::Builder::default()
      .add_migrations("sqlite:my.db", migrations)   // or omit for pre-seed copy
      .build()
  )
  .run(tauri::generate_context!())?;
```

### 3.2 JS Usage

```ts
import Database from '@tauri-apps/plugin-sql';
const db = await Database.load('sqlite:my.db');
await db.execute('INSERT INTO notes(text) VALUES (?)', [text]);
```

### 3.3 Shipping the DB

* **Migrations-only** (recommended): no `.db` in the bundle—plugin creates it.
* **Seed copy**: place `seed/my_seed.db` in `bundle.resources`; on first launch copy to `AppConfig`.

### 3.4 Encryption (Optional)

Enable `sqlite-sqlcipher` feature; store the key in `@tauri-apps/plugin-stronghold`.

---

## 4 External HTTP & APIs

Use `@tauri-apps/plugin-http`; allow-list domains in `tauri.conf.json`.

```ts
import { get } from '@tauri-apps/plugin-http';
const res = await get('https://api.example.com/v1/user', {
  headers: { Authorization: `Bearer ${token}` }
});
```

Benefits: no CORS leaks, TLS handled by Rust, optional cert-pinning.

---

## 5 Firebase OAuth Flow

1. **Firebase Web SDK** inside WebView → `signInWithRedirect`.
2. **`@tauri-apps/plugin-deep-link`** captures the `myapp://auth?...` redirect.
3. WebView completes `getRedirectResult`, obtains ID & refresh tokens.
4. Save tokens securely via Stronghold; inject ID token into every HTTP request.

*No secrets stored in localStorage or IndexedDB.*

---

## 6 Auto-Updates

1. ```bash
   cargo add tauri-plugin-updater
   pnpm add @tauri-apps/plugin-updater
   ```
2. Generate signing keys → embed **public** key in `tauri.conf.json`.
3. `"bundle": { "createUpdaterArtifacts": true }`
4. Host `latest.json` + signed binaries (GitHub Release / S3 / CrabNebula).
5. Check from JS:

   ```ts
   import { check } from '@tauri-apps/plugin-updater';
   const update = await check();
   if (update) { await update.downloadAndInstall(); }
   ```

---

## 7 Security Checklist

| Concern            | Mitigation                                                |
| ------------------ | --------------------------------------------------------- |
| Least-privilege JS | Limit capabilities (`sql:*`, `fs:*`, `http:*`)            |
| Secrets in DOM     | Store only in Stronghold / OS key-store                   |
| Database tampering | SQLCipher; migrations with hashes                         |
| MITM on APIs       | Rust TLS stack + optional pinning; allow-list domains     |
| Update spoofing    | Ed25519-signed artifacts; public key baked into binary    |
| OS sandbox limits  | All writes in `AppConfig`; no elevated installer required |

---

## 8 Typical Project Layout

```
myapp/
│
├── apps/
│   └── web/            # Next.js src
│
├── src-tauri/
│   ├── src/
│   │   └── main.rs
│   ├── migrations/     # optional SQLx .sql files
│   └── tauri.conf.json
│
└── package.json
```

---

## 9 CI / Release Pipeline (GitHub Actions Sketch)

```yaml
- uses: tauri-apps/tauri-action@v2
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.PRIV_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.PRIV_PASS }}
  with:
    releaseDraft: true         # uploads signed installers + latest.json
```

---

## 10 Launch-Day Checklist

* [ ] `output: "export"` in **next.config.js**
* [ ] SQL plugin added & migrations tested
* [ ] Deep-link & HTTP plugins configured
* [ ] Stronghold storing all tokens / keys
* [ ] Updater public key in `tauri.conf.json`; artifacts signed
* [ ] macOS & Windows code-signing certificates applied
* [ ] Version bumped in `Cargo.toml`, `package.json`, and `tauri.conf.json`
* [ ] End-to-end smoke test on Win / macOS / Linux

---

### Outcome

With the steps above you ship a **fast (< 30 MB installer), secure, auto-updating desktop app** that:

* Uses **Next .js** for UI with no runtime Node server
* Reads/writes an on-device **SQLite** DB directly from JS (executed safely in Rust)
* Talks to external APIs through a hardened Rust HTTP layer
* Authenticates via **Firebase OAuth** without leaking credentials
* Delivers signed, one-click **updates** across all major desktop OSes

Happy shipping 🚀
