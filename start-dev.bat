@echo off
chcp 65001 >NUL
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ============================================
echo   Дагестан — запуск приложения для проверки
echo ============================================
echo.

echo [0/3] Закрываю окна прошлого запуска...
taskkill /F /T /FI "WINDOWTITLE eq Dagestan*" >NUL 2>&1

echo.
echo [1/3] Проверяю Docker Desktop...
call :ensure_docker
if errorlevel 1 (
    echo.
    echo ОШИБКА: Docker Desktop не запускается даже после автоматического
    echo лечения известной ошибки. Попробуйте перезагрузить компьютер
    echo и запустить этот файл ещё раз. Если не поможет — напишите об этом.
    echo.
    pause
    exit /b 1
)
echo       Docker готов.

echo.
echo [2/3] Поднимаю базу данных, Redis и Minio...
call npm run infra:up

echo.
REM Node на этом компьютере не ходит в интернет по IPv6, но пробует его первым
REM и ждёт до таймаута. Флаги велят всем окнам брать IPv4 сразу
REM (см. docs/ADR/0009-туннель-разработки.md).
set "NODE_OPTIONS=--dns-result-order=ipv4first --no-network-family-autoselection"

echo [3/3] Запускаю сервер API и мобильное приложение в отдельных окнах...
start "Dagestan API" cmd /k "npm run dev:api"
timeout /t 2 >NUL
start "Dagestan Mobile" cmd /k "npm run dev:mobile"

echo.
echo ============================================
echo Готово! Через несколько секунд в новом окне
echo "Dagestan Mobile" появится QR-код.
echo.
echo Отсканируйте его приложением Expo Go на телефоне.
echo ВАЖНО: телефон и компьютер должны быть в одной
echo Wi-Fi сети — тогда это работает без туннелей
echo и ничего не отваливается.
echo ============================================
echo.
pause
exit /b 0

REM Поднимает Docker Desktop и ждет готовности. Если Docker завис на
REM старте (известная ошибка на этом компьютере), чинит это сам:
REM убивает процессы и переименовывает папки с застрявшими файлами
REM сокетов, чтобы Docker пересоздал их с нуля.
:ensure_docker
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>NUL | find /I "Docker Desktop.exe" >NUL
if errorlevel 1 start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

set /a _tries=0
:ensure_docker_wait1
docker ps >NUL 2>&1
if not errorlevel 1 exit /b 0
set /a _tries+=1
if !_tries! GEQ 20 goto :ensure_docker_stuck
echo       Жду готовности Docker... (!_tries!/20)
timeout /t 3 >NUL
goto :ensure_docker_wait1

:ensure_docker_stuck
echo       Docker завис на старте — это известная ошибка на этом
echo       компьютере, чиню автоматически (займёт около минуты)...
taskkill /F /IM "Docker Desktop.exe" >NUL 2>&1
taskkill /F /IM "com.docker.backend.exe" >NUL 2>&1
timeout /t 3 >NUL
if exist "%LOCALAPPDATA%\Docker\run" ren "%LOCALAPPDATA%\Docker\run" "run.stale-%RANDOM%"
if exist "%LOCALAPPDATA%\docker-secrets-engine" ren "%LOCALAPPDATA%\docker-secrets-engine" "docker-secrets-engine.stale-%RANDOM%"
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

set /a _tries=0
:ensure_docker_wait2
docker ps >NUL 2>&1
if not errorlevel 1 exit /b 0
set /a _tries+=1
if !_tries! GEQ 20 exit /b 1
echo       Жду готовности Docker после лечения... (!_tries!/20)
timeout /t 3 >NUL
goto :ensure_docker_wait2
