@echo off
chcp 65001 >NUL
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ============================================
echo   Дагестан — запуск для проверки БЕЗ Wi-Fi
echo   (телефон подключается через интернет)
echo ============================================
echo.
echo Если что-то не работает — просто запустите этот
echo файл ещё раз: он сам закроет всё старое и поднимет заново.
echo.

if not exist ".env" (
    echo ОШИБКА: нет файла .env рядом с этим файлом.
    echo Скопируйте .env.example в .env и заполните значения.
    pause
    exit /b 1
)

echo [1/6] Останавливаю прошлый запуск...
taskkill /F /T /FI "WINDOWTITLE eq Dagestan*" >NUL 2>&1
call node scripts\dev-supervisor.js --stop >NUL 2>&1
echo       Готово.

echo.
echo [2/6] Проверяю Docker Desktop...
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
echo [3/6] Поднимаю базу данных, Redis и Minio...
call npm run infra:up

echo.
echo [4/6] Собираю общий код (чтобы сервер и приложение видели свежие изменения)...
call npm run build --workspace @dagestan/shared
if errorlevel 1 (
    echo.
    echo ОШИБКА: общий код не собрался. Текст ошибки выше — напишите об этом.
    pause
    exit /b 1
)

echo.
REM Node на этом компьютере не ходит в интернет по IPv6, но пробует его первым
REM и ждёт до таймаута. Флаги велят всем окнам брать IPv4 сразу
REM (см. docs/ADR/0009-туннель-разработки.md).
set "NODE_OPTIONS=--dns-result-order=ipv4first --no-network-family-autoselection"

REM Сервер, туннель и Metro поднимает и держит сторож (scripts\dev-supervisor.js):
REM он работает без окон, сам перезапускает упавшее и запускается при входе
REM в Windows. Этот файл нужен, только чтобы перезапустить всё с нуля.
echo [5/6] Запускаю сторожа (сервер, туннель, приложение)...
call node scripts\install-autostart.js

echo.
echo [6/6] Жду, пока всё поднимется (обычно 2-3 минуты)...
set /a _wait=0
:wait_ready
call node scripts\dev-supervisor.js --status >NUL 2>&1
if not errorlevel 1 goto :ready
set /a _wait+=1
if !_wait! GEQ 40 goto :not_ready
timeout /t 10 >NUL
goto :wait_ready

:not_ready
echo.
echo Не всё поднялось за отведённое время. Что именно:
call node scripts\dev-supervisor.js --status
echo.
echo Журналы лежат в папке .dev-logs. Сторож продолжает попытки сам.
pause
exit /b 1

:ready
echo.
node scripts\show-mobile-qr.js
if errorlevel 1 (
    echo.
    echo Не всё поднялось. Выше написано, какое окно посмотреть.
    echo Обычно помогает просто запустить этот файл ещё раз.
    pause
    exit /b 1
)

echo.
echo ============================================
echo Готово! Открылась картинка с QR-кодом —
echo отсканируйте её приложением Expo Go. Если окно
echo с картинкой не появилось, файл expo-qr.png
echo лежит в этой же папке.
echo.
echo Wi-Fi для этого НЕ нужен, только интернет на
echo телефоне и на компьютере.
echo.
echo Адрес постоянный: exp://raving-amends-periscope.ngrok-free.dev
echo При следующих запусках QR-код тот же.
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
