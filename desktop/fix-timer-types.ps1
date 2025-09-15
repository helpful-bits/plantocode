# PowerShell script to fix timer types from NodeJS.Timeout to number

Write-Host "Fixing timer type issues..." -ForegroundColor Green

# Replace NodeJS.Timeout with number in all TypeScript files
$files = Get-ChildItem -Path "src" -Include "*.ts","*.tsx" -Recurse

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    
    # Replace NodeJS.Timeout with number
    $content = $content -replace 'NodeJS\.Timeout', 'number'
    
    # Replace useRef<Timeout with useRef<number
    $content = $content -replace 'useRef<Timeout', 'useRef<number'
    
    # Replace : Timeout with : number (for standalone Timeout type)
    $content = $content -replace ':\s*Timeout\s*[|;=]', ': number$1'
    
    if ($content -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "Fixed: $($file.Name)" -ForegroundColor Yellow
    }
}

Write-Host "Timer type fixes completed!" -ForegroundColor Green