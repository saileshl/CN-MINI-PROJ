#!/usr/bin/env pwsh
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Building Network Jitter Agent Executable"   -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

pip install pyinstaller
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install PyInstaller" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Building executable..." -ForegroundColor Yellow
pyinstaller --onefile --name NetworkJitterAgent --add-data "config.example.json;." network_agent.py jitter_buffer.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Build complete!" -ForegroundColor Green
Write-Host " Output: dist\NetworkJitterAgent.exe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "To run: .\dist\NetworkJitterAgent.exe --code YOUR_CODE"
