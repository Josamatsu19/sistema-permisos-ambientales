#!/usr/bin/env bash
# =============================================================================
# HE-06 / HT-19 / HT-22: Script de Auditoría de Puertos y Cabeceras con Nmap
# Uso: chmod +x seguridad/run-nmap-inicial.sh && ./seguridad/run-nmap-inicial.sh
# =============================================================================

TARGET_HOST="${1:-127.0.0.1}"
APP_PORT="${2:-3000}"
DB_PORT="${3:-3306}"
OUTPUT_DIR="$(dirname "$0")/evidencias"

mkdir -p "$OUTPUT_DIR"

echo "=================================================================="
echo " Iniciando Escaneo de Seguridad Nmap - Sistema Permisos Ambientales"
echo " Host Objetivo: $TARGET_HOST | Puerto API: $APP_PORT | Puerto BD: $DB_PORT"
echo "=================================================================="

# 1. Detección de versiones de servicios y puertos abiertos (API + MySQL)
nmap -sV -Pn -p "$APP_PORT,$DB_PORT,80,443,8080" "$TARGET_HOST" \
  -oN "$OUTPUT_DIR/01_servicios_y_puertos.txt"

# 2. Auditoría de cabeceras HTTP, métodos permitidos y seguridad web en Express
nmap -Pn -p "$APP_PORT" \
  --script http-headers,http-methods,http-security-headers,http-title \
  "$TARGET_HOST" \
  -oN "$OUTPUT_DIR/02_auditoria_http_headers.txt"

# 3. Verificación de exposición de MySQL
nmap -Pn -p "$DB_PORT" \
  --script mysql-info \
  "$TARGET_HOST" \
  -oN "$OUTPUT_DIR/03_auditoria_mysql.txt"

echo "✅ Escaneo finalizado. Evidencias guardadas en: $OUTPUT_DIR"