@echo off
REM ============================================================
REM  push-dev.bat  -  ajoute, commit et push sur la branche dev
REM  Place ce fichier a la racine du depot FadingUtilities.
REM  Double-clic pour lancer.
REM ============================================================
setlocal enabledelayedexpansion

REM Se placer dans le dossier du script (= racine du depot)
cd /d "%~dp0"

echo.
echo === FadingUtilities : push sur dev ===
echo Dossier : %cd%
echo.

REM Verifier qu'on est bien dans un depot git
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Ce dossier n'est pas un depot git.
    pause
    exit /b 1
)

REM Basculer sur dev
git checkout dev
if errorlevel 1 (
    echo [ERREUR] Impossible de basculer sur la branche dev.
    pause
    exit /b 1
)

REM Y a-t-il quelque chose a committer ?
git status --porcelain > "%temp%\fu_status.txt"
for %%A in ("%temp%\fu_status.txt") do set _size=%%~zA
del "%temp%\fu_status.txt" >nul 2>&1

if "%_size%"=="0" (
    echo Rien a committer. Push des commits locaux existants s'il y en a...
    git push origin dev
    echo.
    echo Termine.
    pause
    exit /b 0
)

echo Changements detectes :
git status --short
echo.

REM Message de commit (saisie, avec valeur par defaut)
set "msg="
set /p "msg=Message de commit (Entree = message auto) : "
if "!msg!"=="" (
    for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set "d=%%a-%%b-%%c"
    for /f "tokens=1-2 delims=: " %%a in ("%time%") do set "t=%%a:%%b"
    set "msg=Mise a jour du site !d! !t!"
)

git add -A
git commit -m "!msg!"
if errorlevel 1 (
    echo [ERREUR] Le commit a echoue.
    pause
    exit /b 1
)

git push origin dev
if errorlevel 1 (
    echo [ERREUR] Le push a echoue.
    pause
    exit /b 1
)

echo.
echo === OK : pousse sur origin/dev ===
pause
endlocal
