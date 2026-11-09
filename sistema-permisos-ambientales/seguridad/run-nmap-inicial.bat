@echo off
REM ===========================================================================
REM HE-06 / HT-19 / HT-22: Script de Auditoria Nmap para Windows
REM ===========================================================================
SET TARGET_HOST=127.0.0.1
SET APP_PORT=3000
SET DB_PORT=3306
SET OUTPUT_DIR=%~dp0evidencias

IF NOT EXIST "%OUTPUT_DIR%" MKDIR "%OUTPUT_DIR%"

echo Ejecutando escaneo de versiones y puertos con Nmap...
nmap -sV -Pn -p %APP_PORT%,%DB_PORT%,80,443,8080 %TARGET_HOST% -oN "%OUTPUT_DIR%\01_servicios_y_puertos.txt"

echo Ejecutando auditoria de cabeceras HTTP y metodos...
nmap -Pn -p %APP_PORT% --script http-headers,http-methods,http-security-headers %TARGET_HOST% -oN "%OUTPUT_DIR%\02_auditoria_http_headers.txt"

echo Ejecutando verificacion de puerto MySQL...
nmap -Pn -p %DB_PORT% --script mysql-info %TARGET_HOST% -oN "%OUTPUT_DIR%\03_auditoria_mysql.txt"

echo Escaneo completado. Revise la carpeta seguridad\evidencias.