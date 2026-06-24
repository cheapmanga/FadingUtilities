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

:: Récupère la date et heure pour le message de commit
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set commitdate=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%

echo [INFO] Dossier: %cd%
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

:: Push vers GitHub
echo [3/3] Push vers GitHub...
git push
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