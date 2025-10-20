# MSIX Build Scripts for PlanToCode

This directory contains scripts for building Microsoft Store MSIX packages for PlanToCode.

## Prerequisites

1. **Windows SDK** - Required for `makeappx.exe` and `signtool.exe`
   - Download from: https://developer.microsoft.com/windows/downloads/windows-sdk/
   - Minimum version: 10.0.19041.0

2. **Tauri Build** - The application must be built first:
   ```bash
   pnpm tauri:build:win:nsis:store
   ```

## Configuration

### msix-config.json

All MSIX package identity and metadata is stored in `msix-config.json`:

- **identity.name**: Package name in Microsoft Store (e.g., "helpfulbitsGmbH.PlanToCode")
- **identity.publisher**: Publisher certificate CN (Microsoft Partner Center ID)
- **identity.publisherDisplayName**: Company name shown in Store
- **application**: App metadata (display name, description, etc.)
- **capabilities**: Required Windows capabilities

⚠️ **Important**: Do not change the `publisher` CN unless you have a new Microsoft Partner Center account.

## Scripts

### build-msix.ps1

Builds an unsigned MSIX package from the Tauri release executable.

```powershell
# Build with default version from package.json
pnpm msix:build

# Build with specific version
powershell -ExecutionPolicy Bypass -File scripts/msix/build-msix.ps1 -Version 1.0.22.0
```

**Output**: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msix/PlanToCode_x.x.x.0_x64.msix`

### verify-msix.ps1

Verifies the structure and contents of an MSIX package.

```powershell
# Verify latest built package
pnpm msix:verify

# Verify specific package
powershell -ExecutionPolicy Bypass -File scripts/msix/verify-msix.ps1 -MsixPath path/to/package.msix
```

### show-msix-info.ps1

Displays identity information from an MSIX package or the current configuration.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/msix/show-msix-info.ps1
```

## NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "msix:build": "powershell -ExecutionPolicy Bypass -File scripts/msix/build-msix.ps1 -Version 1.0.21.0",
    "msix:verify": "powershell -ExecutionPolicy Bypass -File scripts/msix/verify-msix.ps1",
    "msix:build:store": "pnpm build && cd src-tauri && cargo build --release --target x86_64-pc-windows-msvc && cd .. && pnpm msix:build"
  }
}
```

## Signing

### Microsoft Store Distribution

1. Build unsigned package: `pnpm msix:build`
2. Upload to Microsoft Partner Center
3. Microsoft automatically signs the package

### Local Testing

For local testing, you can sign with a self-signed certificate:

```powershell
# Create test certificate (one time)
New-SelfSignedCertificate -Type Custom -Subject "CN=Test Publisher" -KeyUsage DigitalSignature -FriendlyName "Test Certificate" -CertStoreLocation "Cert:\CurrentUser\My"

# Sign package
signtool sign /fd SHA256 /a /f certificate.pfx /p password package.msix
```

## Troubleshooting

### "makeappx.exe not found"
Install Windows SDK from the link above.

### "Executable not found"
Build the Tauri application first: `pnpm tauri:build:win:nsis:store`

### "Package manifest is not valid"
Check `msix-config.json` for valid values. Publisher CN must match your Microsoft Partner Center account.

## Version Control

The following files should be in version control:
- `msix-config.json` - Package identity and metadata
- `build-msix.ps1` - Build script
- `verify-msix.ps1` - Verification script
- `show-msix-info.ps1` - Information display script
- `README.md` - This documentation

## Notes

- Version is automatically read from `package.json` and converted to Windows format (x.x.x.0)
- The Publisher CN (`58806E05-BC90-4351-94F9-CF7626A0F3D6`) is the Microsoft Partner Center publisher ID
- Packages are unsigned by default for upload to Partner Center
- Assets (icons) are copied from `src-tauri/icons/`