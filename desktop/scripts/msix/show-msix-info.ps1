# Display MSIX Package Identity Information
# Shows the current company, certificate, and identity parameters used in MSIX packages

param(
    [string]$MsixPath = ""
)

# If no path provided, try to find the latest MSIX
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
    Write-Host "No MSIX file found. Showing template configuration instead." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "=== Current MSIX Build Configuration ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Identity Parameters:" -ForegroundColor Yellow
    Write-Host "  Package Name: helpfulbitsGmbH.PlanToCode" -ForegroundColor White
    Write-Host "  Publisher CN: CN=58806E05-BC90-4351-94F9-CF7626A0F3D6" -ForegroundColor White
    Write-Host "    (This is a Microsoft Partner Center publisher ID)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Company Information:" -ForegroundColor Yellow
    Write-Host "  Publisher Display Name: helpful bits GmbH" -ForegroundColor White
    Write-Host "  Company Location: Berlin, Germany" -ForegroundColor White
    Write-Host ""
    Write-Host "Certificate Status:" -ForegroundColor Yellow
    Write-Host "  Current: UNSIGNED (for upload to Partner Center)" -ForegroundColor White
    Write-Host "  Signing: Done by Microsoft Partner Center after upload" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To modify these values, edit:" -ForegroundColor Yellow
    Write-Host "  scripts\msix\build-msix.ps1 (lines 140-147)" -ForegroundColor Gray
    exit 0
}

# Find makeappx.exe
$windowsKitPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64"
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

# Unpack and read manifest
$tempDir = "$env:TEMP\msix_info_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
& $makeappx unpack /p $MsixPath /d $tempDir /o 2>&1 | Out-Null

$manifestPath = Join-Path $tempDir 'AppxManifest.xml'
if (Test-Path $manifestPath) {
    [xml]$manifest = Get-Content $manifestPath
    
    Write-Host "=== MSIX Package Information ===" -ForegroundColor Cyan
    Write-Host "Package: $(Split-Path $MsixPath -Leaf)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "Identity Parameters:" -ForegroundColor Yellow
    Write-Host "  Package Name: $($manifest.Package.Identity.Name)" -ForegroundColor White
    Write-Host "  Version: $($manifest.Package.Identity.Version)" -ForegroundColor White
    Write-Host "  Architecture: $($manifest.Package.Identity.ProcessorArchitecture)" -ForegroundColor White
    Write-Host "  Publisher CN: $($manifest.Package.Identity.Publisher)" -ForegroundColor White
    
    # Parse publisher string
    $publisherParts = $manifest.Package.Identity.Publisher -split ','
    foreach ($part in $publisherParts) {
        $part = $part.Trim()
        if ($part.StartsWith("CN=")) {
            $cn = $part.Substring(3)
            if ($cn -match '^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$') {
                Write-Host "    (Microsoft Partner Center Publisher ID)" -ForegroundColor Gray
            } else {
                Write-Host "    (Certificate Common Name)" -ForegroundColor Gray
            }
        }
    }
    Write-Host ""
    
    Write-Host "Company Information:" -ForegroundColor Yellow
    Write-Host "  Publisher Display Name: $($manifest.Package.Properties.PublisherDisplayName)" -ForegroundColor White
    Write-Host "  Display Name: $($manifest.Package.Properties.DisplayName)" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Application Details:" -ForegroundColor Yellow
    $app = $manifest.Package.Applications.Application
    if ($app) {
        Write-Host "  App ID: $($app.Id)" -ForegroundColor White
        Write-Host "  Display Name: $($app.VisualElements.DisplayName)" -ForegroundColor White
        Write-Host "  Description: $($app.VisualElements.Description)" -ForegroundColor White
    }
    Write-Host ""
    
    Write-Host "Certificate Status:" -ForegroundColor Yellow
    # Check if package is signed
    $signTool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
    if (Test-Path $signTool) {
        $verifyResult = & $signTool verify /pa $MsixPath 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Status: SIGNED" -ForegroundColor Green
            # Extract certificate details from output
            $certInfo = $verifyResult | Select-String "Issued to:|Issued by:|Expires:" | ForEach-Object { "    $_" }
            if ($certInfo) {
                Write-Host $certInfo
            }
        } else {
            Write-Host "  Status: UNSIGNED" -ForegroundColor Yellow
            Write-Host "  Note: Package must be signed before distribution" -ForegroundColor Gray
            Write-Host "  Options:" -ForegroundColor Gray
            Write-Host "    1. Upload to Microsoft Partner Center for automatic signing" -ForegroundColor Gray
            Write-Host "    2. Sign locally with a trusted certificate" -ForegroundColor Gray
        }
    } else {
        Write-Host "  Status: Unknown (signtool.exe not found)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Configuration Location:" -ForegroundColor Yellow
    Write-Host "  To modify these values, edit:" -ForegroundColor White
    Write-Host "    scripts\msix\build-msix.ps1 (lines 140-147)" -ForegroundColor Gray
}

# Cleanup
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue