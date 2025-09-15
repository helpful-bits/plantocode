# MSIX Package Verification Script for Vibe Manager
# Verifies the structure and contents of an MSIX package

param(
    [Parameter(Mandatory=$false)]
    [string]$MsixPath = "",
    [switch]$Quiet = $false
)

# If no path provided, try to find the latest MSIX in bundle directory
if (-not $MsixPath) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectRoot = (Get-Item $scriptDir).Parent.Parent.FullName
    $bundleDir = Join-Path $projectRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msix"
    
    if (Test-Path $bundleDir) {
        $latestMsix = Get-ChildItem $bundleDir -Filter "*.msix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestMsix) {
            $MsixPath = $latestMsix.FullName
        }
    }
}

if (-not $MsixPath -or -not (Test-Path $MsixPath)) {
    Write-Host "ERROR: MSIX file not found. Please provide a valid path." -ForegroundColor Red
    exit 1
}

# Find makeappx.exe
$windowsKitPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64"
)

$makeappx = $null
foreach ($path in $windowsKitPaths) {
    $testPath = Join-Path $path "makeappx.exe"
    if (Test-Path $testPath) {
        $makeappx = $testPath
        break
    }
}

if (-not $makeappx) {
    Write-Host "ERROR: makeappx.exe not found. Please install Windows SDK." -ForegroundColor Red
    exit 1
}

$verifyDir = "$env:TEMP\vibe_msix_verify_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

if (-not $Quiet) {
    Write-Host "=== MSIX Package Verification ===" -ForegroundColor Cyan
    Write-Host "Package: $(Split-Path $MsixPath -Leaf)" -ForegroundColor Gray
    Write-Host ""
}

# Unpack the MSIX
if (-not $Quiet) {
    Write-Host "Unpacking MSIX..." -ForegroundColor Yellow
}
Remove-Item $verifyDir -Recurse -Force -ErrorAction SilentlyContinue
$unpackResult = & $makeappx unpack /p $MsixPath /d $verifyDir /o 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to unpack MSIX" -ForegroundColor Red
    Write-Host "$unpackResult" -ForegroundColor Red
    exit 1
}

$hasErrors = $false

# Check 1: Executable files
if (-not $Quiet) {
    Write-Host ""
    Write-Host "Checking executables..." -ForegroundColor Yellow
}
$exeFiles = Get-ChildItem $verifyDir -Recurse -Filter "*.exe"
if ($exeFiles) {
    if (-not $Quiet) {
        Write-Host "  [OK] Found $($exeFiles.Count) executable(s):" -ForegroundColor Green
        foreach ($exe in $exeFiles) {
            $relativePath = $exe.FullName.Replace($verifyDir, "").TrimStart('\')
            $sizeMB = [math]::Round($exe.Length / 1MB, 2)
            Write-Host "    - $relativePath ($sizeMB MB)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  [ERROR] No executable files found!" -ForegroundColor Red
    $hasErrors = $true
}

# Check 2: DLL files
$dllFiles = Get-ChildItem $verifyDir -Recurse -Filter "*.dll"
if ($dllFiles -and -not $Quiet) {
    Write-Host "  [OK] Found $($dllFiles.Count) DLL(s):" -ForegroundColor Green
    foreach ($dll in $dllFiles) {
        $relativePath = $dll.FullName.Replace($verifyDir, "").TrimStart('\')
        Write-Host "    - $relativePath" -ForegroundColor Gray
    }
}

# Check 3: Manifest validation
if (-not $Quiet) {
    Write-Host ""
    Write-Host "Checking manifest..." -ForegroundColor Yellow
}
$manifestPath = Join-Path $verifyDir 'AppxManifest.xml'
if (Test-Path $manifestPath) {
    try {
        [xml]$manifest = Get-Content $manifestPath
        
        # Check Identity
        $identity = $manifest.Package.Identity
        if ($identity) {
            if (-not $Quiet) {
                Write-Host "  [OK] Identity:" -ForegroundColor Green
                Write-Host "    - Name: $($identity.Name)" -ForegroundColor Gray
                Write-Host "    - Version: $($identity.Version)" -ForegroundColor Gray
                Write-Host "    - Publisher: $($identity.Publisher)" -ForegroundColor Gray
                Write-Host "    - Architecture: $($identity.ProcessorArchitecture)" -ForegroundColor Gray
            }
        } else {
            Write-Host "  [ERROR] No Identity element found!" -ForegroundColor Red
            $hasErrors = $true
        }
        
        # Check Application
        $app = $manifest.Package.Applications.Application
        if ($app) {
            if (-not $Quiet) {
                Write-Host "  [OK] Application:" -ForegroundColor Green
                Write-Host "    - ID: $($app.Id)" -ForegroundColor Gray
                Write-Host "    - Executable: $($app.Executable)" -ForegroundColor Gray
                Write-Host "    - EntryPoint: $($app.EntryPoint)" -ForegroundColor Gray
            }
            
            # Verify executable path matches
            $exePath = $app.Executable -replace '\\', [System.IO.Path]::DirectorySeparatorChar
            $fullExePath = Join-Path $verifyDir $exePath
            if (-not (Test-Path $fullExePath)) {
                Write-Host "  [ERROR] Executable specified in manifest not found: $exePath" -ForegroundColor Red
                $hasErrors = $true
            }
        } else {
            Write-Host "  [ERROR] No Application element found!" -ForegroundColor Red
            $hasErrors = $true
        }
        
        # Check Capabilities
        $capabilities = $manifest.Package.Capabilities.ChildNodes
        if ($capabilities -and -not $Quiet) {
            Write-Host "  [OK] Capabilities ($($capabilities.Count)):" -ForegroundColor Green
            foreach ($cap in $capabilities) {
                Write-Host "    - $($cap.Name): $($cap.GetAttribute('Name'))" -ForegroundColor Gray
            }
        }
        
    } catch {
        Write-Host "  [ERROR] Failed to parse manifest: $_" -ForegroundColor Red
        $hasErrors = $true
    }
} else {
    Write-Host "  [ERROR] AppxManifest.xml not found!" -ForegroundColor Red
    $hasErrors = $true
}

# Check 4: Assets
if (-not $Quiet) {
    Write-Host ""
    Write-Host "Checking assets..." -ForegroundColor Yellow
}
$assetsDir = Join-Path $verifyDir "Assets"
if (Test-Path $assetsDir) {
    $assetFiles = Get-ChildItem $assetsDir -File
    if ($assetFiles) {
        if (-not $Quiet) {
            Write-Host "  [OK] Found $($assetFiles.Count) asset(s):" -ForegroundColor Green
            foreach ($asset in $assetFiles) {
                Write-Host "    - $($asset.Name)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  [WARNING] No asset files found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [WARNING] No Assets directory found" -ForegroundColor Yellow
}

# Check 5: Package size
if (-not $Quiet) {
    Write-Host ""
    Write-Host "Package details:" -ForegroundColor Yellow
}
$fileInfo = Get-Item $MsixPath
$sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
if (-not $Quiet) {
    Write-Host "  - Size: $sizeMB MB" -ForegroundColor Gray
    Write-Host "  - Modified: $($fileInfo.LastWriteTime)" -ForegroundColor Gray
}

# Cleanup
Remove-Item $verifyDir -Recurse -Force -ErrorAction SilentlyContinue

# Final result
if (-not $Quiet) {
    Write-Host ""
    if ($hasErrors) {
        Write-Host "=== Verification Failed ===" -ForegroundColor Red
        Write-Host "The package has errors that need to be fixed." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "=== Verification Successful ===" -ForegroundColor Green
        Write-Host "The package is valid and ready for distribution." -ForegroundColor Green
    }
} else {
    if ($hasErrors) {
        exit 1
    }
}

exit 0