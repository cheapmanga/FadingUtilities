@echo off
chcp 65001 >nul
title FadingUtilities - GitHub Push

echo ========================================
echo    FadingUtilities - GitHub Push
echo ========================================
echo.

:: Vérifie que git est installé
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Git n'est pas installé ou n'est pas dans le PATH.
    echo Installe Git depuis: https://git-scm.com/downloads
    pause
    exit /b 1
)

:: Vérifie qu'on est bien dans un dépôt git
if not exist ".git" (
    echo [ERREUR] Ce dossier n'est pas un dépôt Git.
    echo Exécute 'git init' et configure ton remote d'abord.
    pause
    exit /b 1
)

:: Récupère la date et heure via PowerShell (compatible Windows 11)
for /f "delims=" %%I in ('powershell -command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set commitdate=%%I

echo [INFO] Dossier: %cd%
echo [INFO] Date: %commitdate%
echo.

:: Affiche les fichiers modifiés
echo [INFO] Fichiers modifiés:
git status --short
echo.

:: Ajoute tous les fichiers
echo [1/3] Ajout des fichiers...
git add -A
if %errorlevel% neq 0 (
    echo [ERREUR] Impossible d'ajouter les fichiers.
    pause
    exit /b 1
)

:: Vérifie qu'il y a bien quelque chose à committer
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo.
    echo [INFO] Aucun changement à committer. Tout est à jour !
    pause
    exit /b 0
)

:: Commit avec message automatique
echo [2/3] Commit en cours...
git commit -m "Auto-update %commitdate%"
if %errorlevel% neq 0 (
    echo [ERREUR] Échec du commit.
    pause
    exit /b 1
)

:: Push vers GitHub (avec gestion du premier push)
echo [3/3] Push vers GitHub...
git rev-parse --abbrev-ref HEAD >nul 2>nul
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set branch=%%B

:: Vérifie si la branche a déjà un upstream
git rev-parse --abbrev-ref @{upstream} >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Premier push - configuration de l'upstream...
    git push --set-upstream origin %branch%
) else (
    git push
)

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] Échec du push. Vérifie tes identifiants ou ta connexion.
    pause
    exit /b 1
)

echo.
echo ========================================
echo    ✓ Push réussi !
echo ========================================
echo.
pause