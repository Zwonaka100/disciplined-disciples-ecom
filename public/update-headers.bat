@echo off
echo Updating all HTML files to match cart.html header structure...

REM List of files to update (excluding cart.html, checkout.html which are already correct)
set files=blog.html contact.html Product-detail.html faq.html privacy-policy.html shipping-returns.html terms-of-service.html profile.html

for %%f in (%files%) do (
    echo Updating %%f...
    powershell -Command "(Get-Content '%%f') -replace 'header class=\""header\""', 'header class=\""header bg-white shadow\""' | Set-Content '%%f'"
    powershell -Command "(Get-Content '%%f') -replace '<span>Disciplined Disciples</span>', '<span class=\""font-bold text-xl\"">Disciplined Disciples</span>' | Set-Content '%%f'"
)

echo Done updating all files!
pause