@echo off
chcp 65001 >NUL
cd /d "%~dp0"

echo Останавливаю сторожа, сервер, туннель и приложение...
taskkill /F /T /FI "WINDOWTITLE eq Dagestan*" >NUL 2>&1
call node scripts\dev-supervisor.js --stop

echo.
echo Автозапуск при входе в Windows остаётся включённым: после перезагрузки
echo всё поднимется само. Чтобы выключить и его:
echo     npm run dev:autostart -- --remove
echo.

echo Останавливаю базу данных, Redis и Minio...
call npm run infra:down

echo.
echo Готово.
pause
