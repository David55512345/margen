@echo off
rem Envoltorio para el acceso directo del escritorio: delega en el script de
rem PowerShell que arranca el servidor y abre el lector en el navegador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir-lector.ps1"
if errorlevel 1 exit /b 1
exit /b 0
