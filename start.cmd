@echo off
rem EasyRoster — запуск локального сервера и открытие браузера
cd /d "%~dp0"
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install || exit /b 1
)
if not exist apps\web\dist (
  echo Собираю проект...
  call npm run build || exit /b 1
)
node apps\server\dist\index.js --open
