# MSIX Test Signing Script
# Creates a self-signed certificate and signs the MSIX package for local testing
# NOTE: This is ONLY for local testing. Microsoft Store will sign packages automatically.

param(
    [Parameter(Mandatory=$true)]
    [string]$MsixPath
)

Write-Host "=== MSIX Test Signing Tool ===" -ForegroundColor Cyan
Write-Host "NOTE: This is for LOCAL TESTING only!" -ForegroundColor Yellow
Write-Host "Microsoft Store will sign your package automatically when uploaded." -ForegroundColor Yellow
Write-Host ""

# Check if package exists
if (-not (Test-Path $MsixPath)) {
    Write-Host "ERROR: Package not found: $MsixPath" -ForegroundColor Red
    exit 1
}

# Windows SDK paths
$sdkPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64"
)

$signtool = $null
foreach ($path in $sdkPaths) {
    $testPath = Join-Path $path "signtool.exe"
    if (Test-Path $testPath) {
        $signtool = $testPath
        break
    }
}

if (-not $signtool) {
    Write-Host "ERROR: signtool.exe not found. Please install Windows SDK." -ForegroundColor Red
    exit 1
}

Write-Host "Found signtool: $signtool" -ForegroundColor Gray

# Step 1: Create a test certificate
Write-Host ""
Write-Host "Step 1: Creating test certificate..." -ForegroundColor Yellow

$certName = "PlanToCodeTestCert"
$certPath = "$env:TEMP\$certName.pfx"
$certPassword = "TestPassword123!"

# Check if certificate already exists in store
$existingCert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*CN=CB633740-D90E-4813-8294-FB8FB5AC3481*" }

if ($existingCert) {
    Write-Host "   Using existing test certificate" -ForegroundColor Green
    $cert = $existingCert[0]
} else {
    # Create new self-signed certificate matching the Publisher in manifest
    $cert = New-SelfSignedCertificate `
        -Type Custom `
        -Subject "CN=CB633740-D90E-4813-8294-FB8FB5AC3481" `
        -KeyUsage DigitalSignature `
        -FriendlyName "PlanToCode Test Certificate" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    
    Write-Host "   [OK] Test certificate created" -ForegroundColor Green
}

# Export certificate
$securePassword = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $securePassword | Out-Null
Write-Host "   [OK] Certificate exported to: $certPath" -ForegroundColor Green

# Step 2: Sign the package
Write-Host ""
Write-Host "Step 2: Signing package..." -ForegroundColor Yellow

$signResult = & $signtool sign /fd SHA256 /a /f $certPath /p $certPassword $MsixPath 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   [OK] Package signed successfully" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Failed to sign package" -ForegroundColor Red
    Write-Host "   Error: $signResult" -ForegroundColor Red
    exit 1
}

# Step 3: Install certificate to Trusted Root (required for installation)
Write-Host ""
Write-Host "Step 3: Installing certificate to Trusted Root..." -ForegroundColor Yellow
Write-Host "   NOTE: Admin privileges may be required" -ForegroundColor Yellow

$certToInstall = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, $certPassword)
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")

try {
    $store.Open("ReadWrite")
    $existingTrusted = $store.Certificates | Where-Object { $_.Thumbprint -eq $certToInstall.Thumbprint }
    
    if ($existingTrusted) {
        Write-Host "   Certificate already in Trusted Root store" -ForegroundColor Green
    } else {
        $store.Add($certToInstall)
        Write-Host "   [OK] Certificate added to Trusted Root store" -ForegroundColor Green
    }
    $store.Close()
} catch {
    Write-Host "   [WARNING] Could not add to Trusted Root. Run as Administrator or add manually." -ForegroundColor Yellow
    Write-Host "   To add manually: Double-click the .pfx file and install to 'Local Machine > Trusted Root'" -ForegroundColor Yellow
}

# Clean up temp certificate file
Remove-Item $certPath -Force -ErrorAction SilentlyContinue

# Summary
Write-Host ""
Write-Host "=== Signing Complete ===" -ForegroundColor Cyan
Write-Host "Package is now signed for local testing." -ForegroundColor Green
Write-Host ""
Write-Host "You can now install the package with:" -ForegroundColor White
Write-Host "   Add-AppxPackage -Path `"$MsixPath`"" -ForegroundColor Yellow
Write-Host ""
Write-Host "REMINDER: For Microsoft Store submission:" -ForegroundColor Cyan
Write-Host "   - Do NOT sign the package yourself" -ForegroundColor White
Write-Host "   - Upload the unsigned package to Partner Center" -ForegroundColor White
Write-Host "   - Microsoft will sign it automatically" -ForegroundColor White