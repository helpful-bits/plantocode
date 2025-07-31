**MSIX + Microsoft Store / WinGet Distribution Guide (Tauri v2 — July 2025)**

> **Key takeaway:** When your *only* public channel is Microsoft Store (and therefore the built‑in WinGet *store* source), you **do not have to buy any commercial code‑signing certificate at all**.  A free, self‑signed certificate is enough to satisfy Partner Center’s upload requirement, because Microsoft re‑signs your MSIX with its own certificate before users download it.  An **OV/“standard”** certificate is optional—use one only if you also plan to distribute the installer outside the Store (e.g., CI scripts, offline customers) and want to shorten SmartScreen reputation‑building.

---

## 1 Build & Sign – macOS vs Windows

**TL;DR** You can write and debug the whole Tauri codebase on your **Mac**, but the **Store‑ready MSIX must be produced on Windows**—either a local VM (Parallels/VirtualBox), a cloud runner (Azure, GitHub Actions `tauri‑action`), or a colleague’s PC.  The MSIX Packaging Tool, `makeappx.exe`, `signtool.exe`, and the Windows App Certification Kit exist only on Windows and are required for Partner Center acceptance.

1. **Package on Windows** (local VM or CI):

   ```powershell
   pnpm tauri build --bundler msix
   ```

   This invokes MakeAppx and SignTool under the hood.
2. **Sign the MSIX** with your self‑signed (or OV) certificate:

   ```powershell
   signtool sign /fd sha256 /a /f MyDevCert.pfx /p <pwd> MyApp.msix
   ```
3. **Run WACK** on the same Windows box to pre‑validate the package.

> **macOS cross‑compile is still useful for smoke tests** — `tauri build --bundler nsis` works on macOS via `cargo‑xwin` and Homebrew LLVM, but NSIS builds **cannot** be uploaded to the Store.

---

## 1‑A Automating the Windows build with **GitHub Actions** (pnpm)

Below is a pnpm‑ready workflow (`.github/workflows/build‑msix.yml`) that runs on a Windows runner, installs deps with pnpm, builds the MSIX, signs it, runs WACK, and uploads the artifact for manual Partner Center submission.

````yaml
name: Build MSIX for Store
on:
  push:
    tags: [ 'v*.*.*' ]

jobs:
  build-msix:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      # 1 — Set up pnpm and install dependencies
      - uses: pnpm/action-setup@v2
        with:
          version: 9          # or your preferred version
      - name: Install packages
        run: pnpm install --frozen-lockfile

      # 2 — Build with tauri-action (auto‑detects pnpm)
      - uses: tauri-apps/tauri-action@v2
        with:
          tagName: ${{ github.ref_name }}
          releaseId: ${{ github.event.release.id }}
          projectPath: ./
          releaseBinaryPath: src-tauri/target/release/bundle/msix/*.msix
          bundler: msix
          args: '-- --bundler msix'
          windowsCertificate: ${{ secrets.CERT_PFX_BASE64 }}
          windowsCertificatePassword: ${{ secrets.CERT_PFX_PWD }}

      # 3 — Run Windows App Certification Kit (WACK)
      - name: Run WACK
        run: |
          & 'C:/Program Files (x86)/Windows App Certification Kit/appcert.exe' test \
            /packagepath src-tauri/target/release/bundle/msix/*.msix \
            /reportoutput WACKReport.xml

      # 4 — Upload build artifact
      - uses: actions/upload-artifact@v4
        with:
          name: MSIX-${{ github.ref_name }}
          path: src-tauri/target/release/bundle/msix/*.msix
```yaml
name: Build MSIX for Store
on:
  push:
    tags: [ 'v*.*.*' ]

jobs:
  build-msix:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      # 1 — Set up Rust + Node toolchains
      - uses: tauri-apps/tauri-action@v2
        with:
          tagName: ${{ github.ref_name }}         # v1.2.3
          releaseId: ${{ github.event.release.id }}
          projectPath: ./
          releaseBinaryPath: src-tauri/target/release/bundle/msix/*.msix
          # 2 — Enable MSIX build
          bundler: msix
          args: '-- --bundler msix'
          # 3 — Code‑sign inside the action
          #    Store pfx and password in repo → Settings → Secrets
          windowsCertificate: ${{ secrets.CERT_PFX_BASE64 }}
          windowsCertificatePassword: ${{ secrets.CERT_PFX_PWD }}

      # 4 — Run Windows App Certification Kit (WACK)
      - name: Run WACK
        run: |
          & 'C:/Program Files (x86)/Windows App Certification Kit/appcert.exe' test \
            /packagepath src-tauri/target/release/bundle/msix/*.msix \
            /reportoutput WACKReport.xml

      # 5 — Upload build artifact
      - uses: actions/upload-artifact@v4
        with:
          name: MSIX‑${{ github.ref_name }}
          path: src-tauri/target/release/bundle/msix/*.msix
````

**Secrets you need in the repository**

| Secret            | What to store                                                              | How to generate              |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `CERT_PFX_BASE64` | Base64‑encoded `.pfx` containing your self‑signed or OV cert + private key | `base64 -w0 MyDevCert.pfx`   |
| `CERT_PFX_PWD`    | The PFX password                                                           | Choose a strong random value |

> *No paid cert?*  Create a PFX from your self‑signed cert (`New‑SelfSignedCertificate` + `Export‑PfxCertificate`) and store it the same way.

**Why not auto‑submit to Partner Center?**  Microsoft’s submission API is still limited to UWP; Win32/MSIX uploads must be done via the web portal. Typical flow is *CI builds → manual upload* for now.

---

## 2 Submit to Partner Center

> **In the “New product” dropdown choose “MSIX or PWA app”.**  This option is for any desktop application packaged as an MSIX, which the Store will re‑sign and publish, unlocking auto‑updates, delta patches and WinGet ‘store’ integration.
>
> **Why *not* “EXE or MSI app”?**  That lane is meant for legacy Win32 installers you host yourself. If you pick it, Microsoft *does not* re‑sign the file—you must ship it already signed with a public‑CA **OV or EV** certificate, and end‑users lose MSIX conveniences like delta updates, background install and clean uninstall.  Only choose **EXE or MSI** if you *cannot* create an MSIX (e.g., device drivers or a third‑party bootstrapper you can’t wrap in MSIX).
>
> Since you’ve built an MSIX with Tauri, stick with **“MSIX or PWA app”** and continue.

| Step                | What to do                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Reserve name**    | Dashboard ▶ **Create a new app** — name locks for 12 months.                                                                    |
| **Upload package**  | Drag‑and‑drop your self‑signed `.msix` or `.msixbundle` on the *Packages* page.                                                 |
| **Fill details**    | Store Listing, Age Rating (IARC), Pricing, Properties.                                                                          |
| **Gradual rollout** | Optional slider (1 – 100 %) lets you stage the release.                                                                         |
| **Submit**          | Review time: usually **4 h – 3 days** for Win32/MSIX apps. After approval Microsoft CDN re‑signs and publishes within \~15 min. |

Once live, the identical package is automatically discoverable via:

* **Microsoft Store UI** (desktop, web, mini‑mode links).
* **WinGet** → `winget install <YourApp>` and `winget upgrade <YourApp>`.

---

## 3 End‑User Update Experience

| Trigger                                   | What the user sees                                                  |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Scheduled Store scan (≈ 24 h)             | Silent background download; update applied when the app next exits. |
| Manual: Store ▶ Library ▶ **Get updates** | Immediate download/install.                                         |
| CLI: `winget upgrade <YourApp>`           | Same MSIX pulled; progress in terminal.                             |

Because the Store re‑signs with a Microsoft certificate, **SmartScreen never prompts**, even for a day‑zero install.

---

## 4 Routine Release Checklist

1. **Bump version** in `tauri.conf.json`.
2. `pnpm tauri build --bundler msix` (or equivalent) on Windows.
3. **Re‑sign** with your self‑signed (or OV) cert, upload new MSIX.
4. **Submit** → choose a rollout percentage.
5. Monitor Store analytics & crash reports.

Typical time from *build* → *users auto‑updated*: **1 – 2 days** (build + review + next 24 h scan). Power‑users can force it instantly.

---

## 5 Why You Can Skip EV **and** OV

* **Store signature hides your cert** — users see “Publisher: Microsoft Corporation”.
* **Partner Center accepts self‑signed certs for MSIX** uploads.
* **SmartScreen parity** — since Aug 2024 EV and OV build reputation identically; Store‑only users bypass SmartScreen altogether.
* **Cost savings** — €0 vs OV ≈ €350 / yr vs EV KeyLocker ≈ €972 / yr.

> **You still need a cert to sign the package before upload—it just doesn’t have to be from a public CA.**

---

## 6 Optional Enhancements

* **Private flights** — keep a β‑ring inside Partner Center.
* **Store Ads** — sponsored placement in Store search/Bing; set CPC budget in Microsoft Advertising.
* **External distribution** — if you later decide to post an EXE/MSI on GitHub Releases or Chocolatey, that *is* where an OV cert helps SmartScreen.  Buy one at that point, not earlier.

---

### Summary

For a Tauri v2 developer tool that ships *exclusively* through **Microsoft Store + WinGet**, a **self‑signed certificate** is sufficient for packaging, **no purchase required**.  Buy an OV cert only if you start offering direct downloads outside the Store ecosystem.
