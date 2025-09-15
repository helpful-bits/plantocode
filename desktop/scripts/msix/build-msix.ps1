# MSIX Package Builder for Vibe Manager Microsoft Store
# Builds an MSIX package from the Tauri release executable

param(
    [string]$Version = "1.0.20.0",
    [string]$Architecture = "x64",
    [switch]$SkipVerification = $false,
    [switch]$RunWACK = $false
)

# Configuration
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Get-Item $scriptDir).Parent.Parent.FullName
$workDir = "$env:TEMP\vibe_manager_msix_build_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
$targetDir = Join-Path $projectRoot "src-tauri\target\x86_64-pc-windows-msvc\release"
$bundleDir = Join-Path $targetDir "bundle\msix"
$outputPath = Join-Path $bundleDir "VibeManager_${Version}_${Architecture}.msix"
$appExePath = Join-Path $targetDir "vibe-manager.exe"

# Windows SDK paths (try multiple versions)
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

Write-Host "=== Vibe Manager MSIX Package Builder ===" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Gray
Write-Host "Architecture: $Architecture" -ForegroundColor Gray
Write-Host "Using SDK: $makeappx" -ForegroundColor Gray
Write-Host ""

# Check if executable exists
if (-not (Test-Path $appExePath)) {
    Write-Host "ERROR: Executable not found at: $appExePath" -ForegroundColor Red
    Write-Host "Please build the project first with: pnpm tauri:build:win:nsis:store" -ForegroundColor Yellow
    exit 1
}

# Step 1: Clean and prepare work directory
Write-Host "Step 1: Preparing work directory..." -ForegroundColor Yellow
Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item $workDir -ItemType Directory -Force | Out-Null
Write-Host "   [OK] Work directory created" -ForegroundColor Green

# Step 2: Create package structure
Write-Host "Step 2: Creating package structure..." -ForegroundColor Yellow
$vfsDir = Join-Path $workDir "VFS\ProgramFilesX64\Vibe Manager"
$assetsDir = Join-Path $workDir "Assets"
New-Item $vfsDir -ItemType Directory -Force | Out-Null
New-Item $assetsDir -ItemType Directory -Force | Out-Null
Write-Host "   [OK] Directory structure created" -ForegroundColor Green

# Step 3: Copy executable and dependencies
Write-Host "Step 3: Copying executable and dependencies..." -ForegroundColor Yellow
Copy-Item $appExePath "$vfsDir\vibe-manager.exe" -Force
$exeSize = [math]::Round((Get-Item "$vfsDir\vibe-manager.exe").Length / 1MB, 2)
Write-Host "   [OK] Copied vibe-manager.exe ($exeSize MB)" -ForegroundColor Green

# Copy WebView2Loader.dll if exists
$webViewDll = Join-Path $targetDir "WebView2Loader.dll"
if (Test-Path $webViewDll) {
    Copy-Item $webViewDll "$vfsDir\WebView2Loader.dll" -Force
    Write-Host "   [OK] Copied WebView2Loader.dll" -ForegroundColor Green
}

# Copy resources folder if exists
$resourcesPath = Join-Path $projectRoot "src-tauri\resources"
if (Test-Path $resourcesPath) {
    Copy-Item $resourcesPath "$vfsDir\resources" -Recurse -Force
    Write-Host "   [OK] Copied resources folder" -ForegroundColor Green
}

# Step 4: Create and copy assets
Write-Host "Step 4: Preparing assets..." -ForegroundColor Yellow
$iconPath = Join-Path $projectRoot "src-tauri\icons"

# Function to resize image using Windows APIs
function Copy-AssetWithFallback {
    param($Source, $Destination, $Size)
    
    if (Test-Path $Source) {
        # TODO: Implement proper image resizing
        # For now, copy but warn about incorrect sizing
        Copy-Item $Source $Destination -Force
        Write-Host "   [WARNING] Asset $Destination needs proper resizing to $Size" -ForegroundColor Yellow
        return $true
    }
    return $false
}

# Copy various icon sizes (using icon.png as base)
$baseIcon = Join-Path $iconPath "icon.png"
if (Test-Path $baseIcon) {
    Copy-AssetWithFallback $baseIcon "$assetsDir\Square150x150Logo.png" "150x150" | Out-Null
    Copy-AssetWithFallback $baseIcon "$assetsDir\Square44x44Logo.png" "44x44" | Out-Null
    Copy-AssetWithFallback $baseIcon "$assetsDir\StoreLogo.png" "50x50" | Out-Null
    Copy-AssetWithFallback $baseIcon "$assetsDir\Wide310x150Logo.png" "310x150" | Out-Null
    Write-Host "   [OK] Created asset files" -ForegroundColor Green
} else {
    Write-Host "   [WARNING] Icon not found at: $baseIcon" -ForegroundColor Yellow
}

# Step 5: Create AppxManifest.xml
Write-Host "Step 5: Creating AppxManifest.xml..." -ForegroundColor Yellow

# Read MSIX configuration
$configPath = Join-Path $scriptDir "msix-config.json"
if (Test-Path $configPath) {
    $msixConfig = Get-Content $configPath -Raw | ConvertFrom-Json
    Write-Host "   Loaded configuration from msix-config.json" -ForegroundColor Gray
} else {
    Write-Host "   [WARNING] msix-config.json not found, using defaults" -ForegroundColor Yellow
    # Default configuration
    $msixConfig = @{
        identity = @{
            name = "helpfulbitsGmbH.VibeManager"
            publisher = "CN=58806E05-BC90-4351-94F9-CF7626A0F3D6"
            publisherDisplayName = "helpful bits GmbH"
        }
        application = @{
            id = "VibeManager"
            displayName = "Vibe Manager"
            description = "AI-powered productivity and content management application"
            backgroundColor = "transparent"
        }
    }
}

# Read package.json to get the actual version
$packageJsonPath = Join-Path $projectRoot "package.json"
if (Test-Path $packageJsonPath) {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $appVersion = $packageJson.version
    # Convert to Windows Store format (x.x.x.0)
    $versionParts = $appVersion -split '\.'
    if ($versionParts.Count -eq 3) {
        # Ensure 4th segment is always 0 (Store requirement)
        $Version = "$($versionParts[0]).$($versionParts[1]).$($versionParts[2]).0"
        
        # Validate version numbers (must be 0-65535, first cannot be 0)
        if ([int]$versionParts[0] -eq 0) {
            Write-Host "ERROR: First version segment cannot be 0" -ForegroundColor Red
            exit 1
        }
        foreach ($part in $versionParts) {
            if ([int]$part -gt 65535) {
                Write-Host "ERROR: Version segment $part exceeds maximum value of 65535" -ForegroundColor Red
                exit 1
            }
        }
    }
}

# Generate capabilities from configuration
$regularCapabilities = ""
$uapCapabilities = ""
$deviceCapabilities = ""
$restrictedCapabilities = ""

if ($msixConfig.capabilities) {
    foreach ($capability in $msixConfig.capabilities) {
        switch ($capability) {
            "runFullTrust" { $restrictedCapabilities += "    <rescap:Capability Name=`"runFullTrust`" />`n" }
            "broadFileSystemAccess" { $restrictedCapabilities += "    <rescap:Capability Name=`"broadFileSystemAccess`" />`n" }
            "documentsLibrary" { $uapCapabilities += "    <uap:Capability Name=`"documentsLibrary`" />`n" }
            "picturesLibrary" { $uapCapabilities += "    <uap:Capability Name=`"picturesLibrary`" />`n" }
            "videosLibrary" { $uapCapabilities += "    <uap:Capability Name=`"videosLibrary`" />`n" }
            "musicLibrary" { $uapCapabilities += "    <uap:Capability Name=`"musicLibrary`" />`n" }
            "removableStorage" { $uapCapabilities += "    <uap:Capability Name=`"removableStorage`" />`n" }
            "microphone" { $deviceCapabilities += "    <DeviceCapability Name=`"microphone`" />`n" }
            default { $regularCapabilities += "    <Capability Name=`"$capability`" />`n" }
        }
    }
}

$capabilitiesXml = $regularCapabilities + $uapCapabilities + $restrictedCapabilities + $deviceCapabilities

$manifestContent = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
         IgnorableNamespaces="uap uap3 rescap desktop">
  
  <Identity Name="$($msixConfig.identity.name)"
            Publisher="$($msixConfig.identity.publisher)"
            Version="$Version"
            ProcessorArchitecture="$($Architecture.ToLower())" />
  
  <Properties>
    <DisplayName>$($msixConfig.application.displayName)</DisplayName>
    <PublisherDisplayName>$($msixConfig.identity.publisherDisplayName)</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  
  <Resources>
    <Resource Language="en-US" />
  </Resources>
  
  <Applications>
    <Application Id="$($msixConfig.application.id)"
                 Executable="VFS\ProgramFilesX64\Vibe Manager\vibe-manager.exe"
                 EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$($msixConfig.application.displayName)"
        Description="$($msixConfig.application.description)"
        BackgroundColor="$($msixConfig.application.backgroundColor)"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
      </uap:VisualElements>
      
    </Application>
  </Applications>
  
  <Capabilities>
$capabilitiesXml  </Capabilities>
</Package>
"@

$manifestPath = Join-Path $workDir "AppxManifest.xml"
$manifestContent | Out-File -FilePath $manifestPath -Encoding UTF8 -NoNewline
Write-Host "   [OK] Manifest created with version $Version" -ForegroundColor Green

# Step 6: Build MSIX package
Write-Host "Step 6: Building MSIX package..." -ForegroundColor Yellow

# Ensure output directory exists
if (!(Test-Path $bundleDir)) {
    New-Item $bundleDir -ItemType Directory -Force | Out-Null
}

# Build the package
$packResult = & $makeappx pack /d $workDir /p $outputPath /o 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   [ERROR] Failed to create MSIX package" -ForegroundColor Red
    Write-Host "   Error: $packResult" -ForegroundColor Red
    exit 1
}
Write-Host "   [OK] MSIX package created successfully" -ForegroundColor Green

# Step 7: Verify the package (unless skipped)
if (-not $SkipVerification) {
    Write-Host ""
    Write-Host "Step 7: Verifying package..." -ForegroundColor Yellow
    
    # Run verification script
    $verifyScript = Join-Path $scriptDir "verify-msix.ps1"
    if (Test-Path $verifyScript) {
        & $verifyScript -MsixPath $outputPath -Quiet
    } else {
        Write-Host "   [WARNING] Verification script not found" -ForegroundColor Yellow
    }
    
    # Run Windows App Certification Kit if requested
    if ($RunWACK) {
        Write-Host "   Running Windows App Certification Kit..." -ForegroundColor Yellow
        $wackPath = "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
        if (Test-Path $wackPath) {
            $reportPath = Join-Path $bundleDir "WACK_Report_$(Get-Date -Format 'yyyyMMdd_HHmmss').xml"
            $wackResult = & $wackPath test -appxpackagepath "$outputPath" -reportoutputpath "$reportPath" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   [OK] WACK validation passed. Report: $reportPath" -ForegroundColor Green
            } else {
                Write-Host "   [ERROR] WACK validation failed. Check report: $reportPath" -ForegroundColor Red
                Write-Host "   Run manually: appcert.exe test -appxpackagepath `"$outputPath`"" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   [WARNING] Windows App Certification Kit not found" -ForegroundColor Yellow
            Write-Host "   Install Windows SDK to run WACK validation" -ForegroundColor Yellow
        }
    }
}

# Cleanup
Write-Host ""
Write-Host "Step 8: Cleaning up..." -ForegroundColor Yellow
Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "   [OK] Temporary files removed" -ForegroundColor Green

# Final summary
$fileInfo = Get-Item $outputPath
$sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Package: $(Split-Path $outputPath -Leaf)" -ForegroundColor White
Write-Host "Size: $sizeMB MB" -ForegroundColor White
Write-Host "Location: $outputPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Test locally with: Add-AppxPackage -Path `"$outputPath`"" -ForegroundColor Gray
Write-Host "  2. Run WACK validation: .\build-msix.ps1 -RunWACK" -ForegroundColor Gray
Write-Host "  3. Upload to Microsoft Partner Center for signing and distribution" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANT: Before Store submission, always run:" -ForegroundColor Yellow
Write-Host "  - Windows App Certification Kit (WACK) for validation" -ForegroundColor Yellow
Write-Host "  - Test on multiple Windows versions and architectures" -ForegroundColor Yellow