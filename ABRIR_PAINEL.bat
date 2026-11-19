@echo off
chcp 65001 >nul
title Painel - Operacao Marte Zero
cd /d "%~dp0"
echo Abrindo o painel em http://127.0.0.1:8800 ...
echo (deixe esta janela aberta; feche ou aperte Ctrl+C para parar)
echo.
python producao\painel.py --abrir
if errorlevel 1 pause
