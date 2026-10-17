@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Iniciar Agenda
set "SCRIPT=%~dp0scripts\windows.ps1"
set "POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%SCRIPT%" (
  echo ERRO: extraia o ZIP completo antes de abrir este atalho.
  if not defined CI pause
  exit /b 2
)
if not exist "%POWERSHELL%" (
  echo ERRO: Windows PowerShell nao encontrado. Use a alternativa por comandos do manual.
  if not defined CI pause
  exit /b 3
)
echo Abrindo Iniciar Agenda. Aguarde a interface grafica.
echo Esta janela mostra mensagens de inicializacao e erros.
"%POWERSHELL%" -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  if not defined CI "%POWERSHELL%" -NoLogo -NoProfile -WindowStyle Normal -Command "exit 0"
  echo ERRO: a operacao nao foi concluida. Codigo: %EXIT_CODE%.
  echo Confira a mensagem acima e o guia de instalacao do produto.
  if not defined CI pause
)
exit /b %EXIT_CODE%
