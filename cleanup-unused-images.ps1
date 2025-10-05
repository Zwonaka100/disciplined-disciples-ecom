# Script to remove unused images and free up storage space
Write-Host "Starting cleanup of unused images..." -ForegroundColor Cyan

# Get all image files in the Assets directory
$allImages = Get-ChildItem -Path "public\Assets" -Recurse -Include "*.jpg", "*.jpeg", "*.png", "*.gif", "*.webp" | 
    ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\public\", "").Replace("\", "/") }

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

# Calculate total size before deletion
$totalUnusedSize = 0
foreach ($unused in $unusedImages) {
    $fullPath = "public\$($unused.Replace('/', '\'))"
    if (Test-Path $fullPath) {
        $totalUnusedSize += (Get-Item $fullPath).Length
    }
}

Write-Host "`nFound $($unusedImages.Count) unused images totaling $('{0:N2}' -f ($totalUnusedSize / 1MB)) MB" -ForegroundColor Yellow

# Ask for confirmation
$confirmation = Read-Host "`nDo you want to delete these unused images? This will free up $('{0:N2}' -f ($totalUnusedSize / 1MB)) MB of storage. (y/N)"

if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
    Write-Host "`nDeleting unused images..." -ForegroundColor Red
    
    $deletedCount = 0
    $deletedSize = 0
    
    foreach ($unused in $unusedImages) {
        $fullPath = "public\$($unused.Replace('/', '\'))"
        if (Test-Path $fullPath) {
            $fileSize = (Get-Item $fullPath).Length
            try {
                Remove-Item $fullPath -Force
                $deletedCount++
                $deletedSize += $fileSize
                Write-Host "  Deleted: $unused" -ForegroundColor DarkRed
            }
            catch {
                Write-Host "  Failed to delete: $unused - $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    
    Write-Host "`n=== CLEANUP COMPLETE ===" -ForegroundColor Green
    Write-Host "Files deleted: $deletedCount"
    Write-Host "Storage freed: $('{0:N2}' -f ($deletedSize / 1MB)) MB"
    Write-Host "This should reduce your Firebase hosting storage usage significantly!" -ForegroundColor Green
    
    # Check if we're now under the 10GB limit
    $remainingImages = Get-ChildItem -Path "public\Assets" -Recurse -Include "*.jpg", "*.jpeg", "*.png", "*.gif", "*.webp"
    $totalRemainingSize = ($remainingImages | Measure-Object -Property Length -Sum).Sum
    
    Write-Host "`nRemaining images: $($remainingImages.Count)"
    Write-Host "Remaining Assets storage: $('{0:N2}' -f ($totalRemainingSize / 1MB)) MB"
    
    if (($totalRemainingSize / 1GB) -lt 10) {
        Write-Host "Great! Your storage should now be under the Firebase free tier limit." -ForegroundColor Green
    } else {
        Write-Host "You might still be over the limit. Consider optimizing remaining images or removing more content." -ForegroundColor Yellow
    }
    
} else {
    Write-Host "`nCleanup cancelled. No files were deleted." -ForegroundColor Yellow
}