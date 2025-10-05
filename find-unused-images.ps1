# Script to find unused images in the Assets folder
Write-Host "Analyzing image usage..." -ForegroundColor Cyan

# Get all image files in the Assets directory
$allImages = Get-ChildItem -Path "public\Assets" -Recurse -Include "*.jpg", "*.jpeg", "*.png", "*.gif", "*.webp" | 
    ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\public\", "").Replace("\", "/") }

Write-Host "Found $($allImages.Count) total images in Assets folder" -ForegroundColor Yellow

# Search for image references in code files
$codeFiles = Get-ChildItem -Path "public" -Include "*.html", "*.js", "*.css" -Recurse
$usedImages = @()

foreach ($file in $codeFiles) {
    $content = Get-Content $file.FullName -Raw
    
    # Find all image references with various patterns
    $patterns = @(
        'Assets/[^"''`\s)]+\.(jpg|jpeg|png|gif|webp)',
        'assets/[^"''`\s)]+\.(jpg|jpeg|png|gif|webp)',
        'src="Assets/[^"]+\.(jpg|jpeg|png|gif|webp)',
        'href="Assets/[^"]+\.(jpg|jpeg|png|gif|webp)',
        "'Assets/[^']+\.(jpg|jpeg|png|gif|webp)"
    )
    
    foreach ($pattern in $patterns) {
        $matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        foreach ($match in $matches) {
            $imagePath = $match.Value
            # Clean up the path
            $imagePath = $imagePath -replace '^src="', '' -replace '^href="', '' -replace '^[''"]', '' -replace '[''"]$', ''
            $imagePath = $imagePath -replace '\?size=small', ''
            # Normalize case
            if ($imagePath -match '^assets/') {
                $imagePath = $imagePath -replace '^assets/', 'Assets/'
            }
            $usedImages += $imagePath
        }
    }
}

# Remove duplicates and sort
$usedImages = $usedImages | Sort-Object -Unique

Write-Host "Found $($usedImages.Count) unique image references in code" -ForegroundColor Yellow

# Find unused images
$unusedImages = @()
foreach ($image in $allImages) {
    $found = $false
    foreach ($used in $usedImages) {
        if ($image -eq $used) {
            $found = $true
            break
        }
    }
    if (-not $found) {
        $unusedImages += $image
    }
}

Write-Host "`nUNUSED IMAGES ($($unusedImages.Count) found):" -ForegroundColor Red
foreach ($unused in $unusedImages) {
    $fullPath = "public\$($unused.Replace('/', '\'))"
    $size = (Get-Item $fullPath).Length / 1MB
    Write-Host "  $unused ($('{0:N2}' -f $size) MB)" -ForegroundColor Red
}

# Calculate total size of unused images
$totalUnusedSize = 0
foreach ($unused in $unusedImages) {
    $fullPath = "public\$($unused.Replace('/', '\'))"
    $totalUnusedSize += (Get-Item $fullPath).Length
}

Write-Host "`nTotal unused images size: $('{0:N2}' -f ($totalUnusedSize / 1MB)) MB" -ForegroundColor Magenta

Write-Host "`nUSED IMAGES ($($usedImages.Count) found):" -ForegroundColor Green
foreach ($used in $usedImages) {
    Write-Host "  $used" -ForegroundColor Green
}

# Show some statistics
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total images: $($allImages.Count)"
Write-Host "Used images: $($usedImages.Count)"
Write-Host "Unused images: $($unusedImages.Count)"
Write-Host "Unused storage: $('{0:N2}' -f ($totalUnusedSize / 1MB)) MB"
Write-Host "Potential savings: $('{0:N2}' -f ($totalUnusedSize / 1GB)) GB"