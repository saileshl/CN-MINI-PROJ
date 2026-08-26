@echo off
echo ============================================
echo  Building Network Jitter Agent Executable
echo ============================================
echo.

pip install pyinstaller
if errorlevel 1 (
    echo [ERROR] Failed to install PyInstaller
    exit /b 1
)

echo.
echo Building executable...
pyinstaller --onefile --name NetworkJitterAgent --add-data "config.example.json;." network_agent.py jitter_buffer.py
if errorlevel 1 (
    echo [ERROR] Build failed
    exit /b 1
)

echo.
echo ============================================
echo  Build complete!
echo  Output: dist\NetworkJitterAgent.exe
echo ============================================
echo.
echo To run: dist\NetworkJitterAgent.exe --code YOUR_CODE
