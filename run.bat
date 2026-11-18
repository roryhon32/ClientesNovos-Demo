@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
    echo Python nao encontrado. Instale o Python 3.12 ou superior e adicione ao PATH.
    pause
    exit /b 1
)
python -u "%~dp0scripts\run_local.py" %*
set "RUN_EXIT_CODE=%ERRORLEVEL%"
if not "%RUN_EXIT_CODE%"=="0" pause
exit /b %RUN_EXIT_CODE%
