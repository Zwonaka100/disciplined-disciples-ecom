# PowerShell script to fix dropdown positioning across all HTML files

$files = @(
    "blog.html",
    "contact.html", 
    "checkout.html",
    "faq.html",
    "terms-of-service.html",
    "privacy-policy.html",
    "shipping-returns.html",
    "Product-detail.html",
    "profile.html"
)

$oldPattern = @'
                    <!-- Dropdown menu - absolutely positioned -->
                    <div id="profile-dropdown" class="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] z-50 overflow-hidden hidden">
'@

$newPattern = @'
                </div>
                <!-- Dropdown menu - positioned outside toolbar to prevent layout disruption -->
                <div id="profile-dropdown" class="fixed right-4 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[200px] z-[9999] overflow-hidden hidden" style="top: 70px;">
'@

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Processing $file..."
        $content = Get-Content $file -Raw
        $content = $content -replace [regex]::Escape($oldPattern), $newPattern
        Set-Content $file $content -NoNewline
        Write-Host "Updated $file"
    } else {
        Write-Host "File $file not found"
    }
}

Write-Host "Dropdown positioning fix completed for all files!"