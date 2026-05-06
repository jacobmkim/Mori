param(
  [Parameter(Mandatory=$true)][string]$InputDir,
  [string]$OutputDir = "",
  [int]$Width = 1320,
  [int]$Height = 2868
)

if (-not $OutputDir) { $OutputDir = Join-Path $InputDir "resized-1320x2868" }
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

Add-Type -AssemblyName System.Drawing

$files = Get-ChildItem -Path $InputDir -Filter *.png -File
if ($files.Count -eq 0) { Write-Host "No PNGs found in $InputDir"; exit 1 }

Write-Host "Resizing $($files.Count) images to ${Width}x${Height} -> $OutputDir"

foreach ($file in $files) {
  try {
    $src = [System.Drawing.Image]::FromFile($file.FullName)
    $dst = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $dst.SetResolution(72, 72)

    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode    = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode        = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode      = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality   = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($src, 0, 0, $Width, $Height)

    $outPath = Join-Path $OutputDir $file.Name
    $dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose(); $dst.Dispose(); $src.Dispose()
    Write-Host "  $($file.Name) -> ${Width}x${Height}"
  } catch {
    Write-Host "  FAILED on $($file.Name): $_" -ForegroundColor Red
  }
}

Write-Host "Done. Files saved to $OutputDir"
