# PowerShell script to add Google Analytics 4 and WhatsApp button to all HTML files

$files = @(
    "cart.html",
    "checkout.html",
    "Product-detail.html",
    "profile.html",
    "contact.html",
    "blog.html",
    "admin-dashboard.html",
    "login-signup.html",
    "thank-you.html",
    "order-history.html",
    "faq.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "shipping-returns.html",
    "404.html"
)

$publicDir = "c:\Users\Zwonaka Mabege\OneDrive\Desktop\Zande Technologies\Disciplined\DisciplinedDisciples\public"

$ga4Script = @"
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-2J1GWH59V4"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-2J1GWH59V4');
    </script>
"@

$whatsappButton = @"

    <!-- WhatsApp Floating Button -->
    <a href="https://wa.me/27692060618?text=Hi%20Disciplined%20Disciples!%20I%20have%20a%20question%20about%20your%20products." 
       class="whatsapp-float" 
       target="_blank" 
       rel="noopener noreferrer"
       aria-label="Chat on WhatsApp">
        <i class="fab fa-whatsapp"></i>
    </a>
"@

foreach ($file in $files) {
    $filePath = Join-Path $publicDir $file
    
    if (Test-Path $filePath) {
        Write-Host "Processing $file..." -ForegroundColor Cyan
        
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Add GA4 before </head> if not already present
        if ($content -notmatch "gtag/js\?id=G-2J1GWH59V4") {
            $content = $content -replace "</head>", "$ga4Script`n</head>"
            Write-Host "  [+] Added Google Analytics 4" -ForegroundColor Green
        } else {
            Write-Host "  [~] Google Analytics 4 already present" -ForegroundColor Yellow
        }
        
        # Add WhatsApp button before </body> if not already present
        if ($content -notmatch "whatsapp-float") {
            $content = $content -replace "</body>", "$whatsappButton`n</body>"
            Write-Host "  [+] Added WhatsApp button" -ForegroundColor Green
        } else {
            Write-Host "  [~] WhatsApp button already present" -ForegroundColor Yellow
        }
        
        # Save the file
        Set-Content -Path $filePath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "  [*] Saved $file" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "  [!] File not found: $file" -ForegroundColor Red
        Write-Host ""
    }
}

Write-Host "[DONE] Processed all files." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: firebase deploy --only hosting" -ForegroundColor White
Write-Host "2. Test GA4 tracking" -ForegroundColor White
Write-Host "3. Test WhatsApp button" -ForegroundColor White
