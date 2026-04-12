# build-release.ps1
# Automates the creation of a SillyTavern-ready ZIP release.

# 1. Get version from package.json
if (!(Test-Path "package.json")) {
    Write-Error "package.json not found in current directory"
    exit 1
}

$package = Get-Content -Raw "package.json" | ConvertFrom-Json
$version = $package.version
$releaseName = "SillyTavern-MCP-Local-Search-v$version"
$zipPath = "$PSScriptRoot\$releaseName.zip"
$tempDir = "$PSScriptRoot\release_temp"

Write-Host "`n🚀 Building v$version..." -ForegroundColor Cyan

# 2. Compile TypeScript
Write-Host "🛠️  Running npm run build..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}

# 3. Prepare temporary structure
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path "$tempDir\plugins\mcp-local-search" | Out-Null
New-Item -ItemType Directory -Path "$tempDir\public\scripts\extensions\third-party\mcp-local-search" | Out-Null

# 4. Copy Server Files (Preserve modular structure)
Write-Host "📂 Packaging server files..."
Get-ChildItem -Path "dist/server/*" -Recurse | Copy-Item -Destination "$tempDir\plugins\mcp-local-search" -Recurse -Force

# Create a clean production-only package.json
Write-Host "📜 Creating production package.json..."
$prodPackage = [PSCustomObject]@{
    name        = $package.name
    version     = $package.version
    description = $package.description
    main        = $package.main
    type        = $package.type
    author      = $package.author
    license     = $package.license
    dependencies = $package.dependencies
    scripts     = [PSCustomObject]@{
        prepare = "playwright install chromium"
    }
}
$prodPackage | ConvertTo-Json -Depth 10 | Set-Content -Path "$tempDir\plugins\mcp-local-search\package.json"

# Copy metadata files
Copy-Item -Path "README.md", "LICENSE" -Destination "$tempDir\plugins\mcp-local-search" -ErrorAction SilentlyContinue -Force

# 5. Copy Client Files
Write-Host "📂 Packaging client files..."
Copy-Item -Path "public/scripts/extensions/third-party/mcp-local-search/*" -Destination "$tempDir\public\scripts\extensions\third-party\mcp-local-search" -Recurse -Force

# 6. Create ZIP
Write-Host "📦 Creating ZIP: $releaseName.zip" -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Zip the contents of the temp directory so the root of the ZIP contains 'plugins' and 'public'
Set-Location -Path $tempDir
Compress-Archive -Path "*" -DestinationPath $zipPath -Force
Set-Location -Path $PSScriptRoot

# 7. Cleanup
Remove-Item -Recurse -Force $tempDir

Write-Host "`n✅ Release bundle created successfully: $zipPath" -ForegroundColor Green
Write-Host "You can now share this ZIP for direct extraction into a SillyTavern root directory.`n"
