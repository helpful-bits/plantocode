# MSIX Store Submission Validator for Vibe Manager
# Validates MSIX package against Microsoft Store requirements
# Based on 2025 Microsoft Store certification requirements

param(
    [Parameter(Mandatory=$true)]
    [string]$MsixPath,
    [switch]$DetailedOutput = $false
)

$script:hasErrors = $false
$script:hasWarnings = $false

function Write-ValidationError {
    param($Message)
    Write-Host "   [ERROR] $Message" -ForegroundColor Red
    $script:hasErrors = $true
}

function Write-ValidationWarning {
    param($Message)
    Write-Host "   [WARNING] $Message" -ForegroundColor Yellow
    $script:hasWarnings = $true
}

function Write-ValidationSuccess {
    param($Message)
    Write-Host "   [OK] $Message" -ForegroundColor Green
}

Write-Host "=== MSIX Store Submission Validator ===" -ForegroundColor Cyan
Write-Host "Package: $(Split-Path $MsixPath -Leaf)" -ForegroundColor Gray
Write-Host ""

# Check if package exists
if (-not (Test-Path $MsixPath)) {
    Write-ValidationError "Package not found: $MsixPath"
    exit 1
}

# Step 1: Extract and validate manifest
Write-Host "Step 1: Extracting and validating manifest..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\msix_validation_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item $tempDir -ItemType Directory -Force | Out-Null

# Copy as ZIP and extract
Copy-Item $MsixPath "$tempDir\package.zip"
Expand-Archive "$tempDir\package.zip" -DestinationPath $tempDir -Force

$manifestPath = Join-Path $tempDir "AppxManifest.xml"
if (-not (Test-Path $manifestPath)) {
    Write-ValidationError "AppxManifest.xml not found in package"
    exit 1
}

[xml]$manifest = Get-Content $manifestPath

# Step 2: Validate Identity
Write-Host "Step 2: Validating package identity..." -ForegroundColor Yellow

$identity = $manifest.Package.Identity
if ($identity) {
    # Check version format (x.x.x.0)
    $version = $identity.Version
    $versionParts = $version -split '\.'
    
    if ($versionParts.Count -ne 4) {
        Write-ValidationError "Version must have 4 segments (x.x.x.0)"
    } elseif ($versionParts[3] -ne "0") {
        Write-ValidationError "Fourth version segment must be 0 for Store submission (found: $($versionParts[3]))"
    } else {
        Write-ValidationSuccess "Version format correct: $version"
    }
    
    # Validate version ranges
    if ([int]$versionParts[0] -eq 0) {
        Write-ValidationError "First version segment cannot be 0"
    }
    
    foreach ($i in 0..2) {
        if ([int]$versionParts[$i] -gt 65535) {
            Write-ValidationError "Version segment $($versionParts[$i]) exceeds maximum (65535)"
        }
    }
    
    # Check publisher format
    if ($identity.Publisher -notmatch '^CN=') {
        Write-ValidationError "Publisher must start with 'CN=' (found: $($identity.Publisher))"
    } else {
        Write-ValidationSuccess "Publisher format correct: $($identity.Publisher)"
    }
} else {
    Write-ValidationError "Identity element not found in manifest"
}

# Step 3: Validate Resources
Write-Host "Step 3: Validating resources..." -ForegroundColor Yellow

$resources = $manifest.Package.Resources.Resource
$hasValidLanguage = $false
foreach ($resource in $resources) {
    $lang = $resource.Language
    if ($lang -eq "x-generate") {
        Write-ValidationError "Invalid resource language 'x-generate' found - must be replaced with actual language codes"
    } elseif ($lang -match '^[a-z]{2}-[A-Z]{2}$' -or $lang -match '^[a-z]{2}$') {
        $hasValidLanguage = $true
        Write-ValidationSuccess "Valid language resource: $lang"
    } else {
        Write-ValidationWarning "Unusual language format: $lang"
    }
}

if (-not $hasValidLanguage) {
    Write-ValidationError "No valid language resources found"
}

# Step 4: Validate Dependencies
Write-Host "Step 4: Validating dependencies..." -ForegroundColor Yellow

$targetFamily = $manifest.Package.Dependencies.TargetDeviceFamily
if ($targetFamily) {
    $minVersion = $targetFamily.MinVersion
    $maxVersion = $targetFamily.MaxVersionTested
    
    if ($minVersion -lt "10.0.17763.0") {
        Write-ValidationWarning "MinVersion ($minVersion) is below recommended (10.0.17763.0)"
    } else {
        Write-ValidationSuccess "MinVersion: $minVersion"
    }
    
    if ($maxVersion -lt "10.0.22621.0") {
        Write-ValidationWarning "MaxVersionTested ($maxVersion) should be updated to latest Windows version"
    } else {
        Write-ValidationSuccess "MaxVersionTested: $maxVersion"
    }
} else {
    Write-ValidationError "TargetDeviceFamily not found"
}

# Step 5: Check for required assets
Write-Host "Step 5: Validating assets..." -ForegroundColor Yellow

$requiredAssets = @(
    "Assets\StoreLogo.png",
    "Assets\Square150x150Logo.png",
    "Assets\Square44x44Logo.png"
)

foreach ($asset in $requiredAssets) {
    $assetPath = Join-Path $tempDir $asset
    if (Test-Path $assetPath) {
        Write-ValidationSuccess "Found required asset: $asset"
    } else {
        Write-ValidationError "Missing required asset: $asset"
    }
}

# Step 6: Validate capabilities
Write-Host "Step 6: Validating capabilities..." -ForegroundColor Yellow

$capabilities = $manifest.Package.Capabilities
if ($capabilities) {
    $specialCaps = $capabilities.SelectNodes("//*[local-name()='Capability' and @Name='broadFileSystemAccess']")
    if ($specialCaps.Count -gt 0) {
        Write-ValidationWarning "Special capability 'broadFileSystemAccess' requires justification for Store"
    }
    
    $runFullTrust = $capabilities.SelectNodes("//*[local-name()='Capability' and @Name='runFullTrust']")
    if ($runFullTrust.Count -gt 0) {
        Write-ValidationSuccess "runFullTrust capability found (required for desktop apps)"
    }
}

# Step 7: Check file names for ANSI compliance
Write-Host "Step 7: Checking filenames for ANSI compliance..." -ForegroundColor Yellow

$files = Get-ChildItem $tempDir -Recurse -File
$nonAnsiFiles = @()

foreach ($file in $files) {
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($file.Name)
    $asciiName = [System.Text.Encoding]::ASCII.GetString($bytes)
    if ($file.Name -ne $asciiName) {
        $nonAnsiFiles += $file.Name
    }
}

if ($nonAnsiFiles.Count -gt 0) {
    Write-ValidationError "Non-ANSI filenames found: $($nonAnsiFiles -join ', ')"
} else {
    Write-ValidationSuccess "All filenames are ANSI-compliant"
}

# Step 8: Check signature
Write-Host "Step 8: Checking package signature..." -ForegroundColor Yellow

$signatureFile = Join-Path $tempDir "AppxSignature.p7x"
if (Test-Path $signatureFile) {
    Write-ValidationSuccess "Package is signed"
} else {
    Write-ValidationWarning "Package is not signed (will be signed by Store)"
}

# Step 9: Run Windows App Certification Kit if available
Write-Host "Step 9: Windows App Certification Kit..." -ForegroundColor Yellow

$wackPath = "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
if (Test-Path $wackPath) {
    Write-Host "   WACK found. Run manually for full validation:" -ForegroundColor Cyan
    Write-Host "   appcert.exe test -appxpackagepath `"$MsixPath`"" -ForegroundColor Gray
} else {
    Write-ValidationWarning "WACK not installed - install Windows SDK for full validation"
}

# Cleanup
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

# Summary
Write-Host ""
Write-Host "=== Validation Summary ===" -ForegroundColor Cyan

if ($script:hasErrors) {
    Write-Host "RESULT: FAILED - Package has errors that must be fixed" -ForegroundColor Red
    Write-Host "Fix all [ERROR] items before Store submission" -ForegroundColor Red
    exit 1
} elseif ($script:hasWarnings) {
    Write-Host "RESULT: PASSED WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "Review [WARNING] items before Store submission" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "RESULT: PASSED - Package is ready for Store submission" -ForegroundColor Green
    Write-Host "Recommended: Run full WACK validation before submission" -ForegroundColor Cyan
    exit 0
}