# Build APK release — bắt buộc JDK 21 (Capacitor 8; không dùng JDK 26 trên PATH)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$jdk21 = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"

if (-not (Test-Path "$jdk21\bin\java.exe")) {
    Write-Host "Chưa có JDK 21. Đang cài Microsoft OpenJDK 21..."
    winget install -e --id Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
}

$env:JAVA_HOME = $jdk21
$env:Path = "$jdk21\bin;" + $env:Path

Push-Location $root
npm run version:sync
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
npx cap sync android
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Push-Location "$root\android"
.\gradlew --stop
# Bắt buộc clean: mergeReleaseAssets có thể giữ bundle JS cũ (lỗi "chương quá dài" dù đã cap sync).
.\gradlew clean assembleRelease
$code = $LASTEXITCODE
if ($code -eq 0) {
    $d = Get-Date
    $rev = "Rev {0:00}.{1:00}.{2}" -f $d.Day, $d.Month, $d.Year
    $apkDir = Join-Path $root "android\app\build\outputs\apk\release"
    $srcApk = Get-ChildItem $apkDir -Filter "*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($srcApk) {
        $safeRev = $rev -replace '[^\w\.\-]', '_'
        $destName = "NovelTranslator-$safeRev.apk"
        Copy-Item $srcApk.FullName (Join-Path $apkDir $destName) -Force
        Write-Host "APK có tên phiên bản: $apkDir\$destName"
    }
}
Pop-Location
exit $code
