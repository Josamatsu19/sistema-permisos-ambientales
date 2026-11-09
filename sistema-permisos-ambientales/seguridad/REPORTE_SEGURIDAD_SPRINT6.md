# Reporte de Análisis Inicial de Seguridad (Sprint 6 - HE-06, HT-19, HT-20)

**Proyecto:** Sistema Digital de Evaluación de Permisos Ambientales (MiAmbiente)  
**Herramienta de Auditoría:** Nmap 7.94 (`nmap -sV --script http-headers,http-security-headers`)  
**Objetivo Evaluado:** `127.0.0.1` (Puertos `3000` API Node.js/Express y `3306` MySQL)

---

## 1. Resumen de Puertos Descubiertos (Baseline Inicial)

| Puerto     | Protocolo | Estado | Servicio Detectado                        | Riesgo Inicial | Observación Técnica                                                                      |
| :--------- | :-------- | :----- | :---------------------------------------- | :------------- | :--------------------------------------------------------------------------------------- |
| `3000/tcp` | TCP       | `open` | Node.js Express (`X-Powered-By: Express`) | **Medio**      | Expone innecesariamente la firma del framework en cabeceras HTTP.                        |
| `3306/tcp` | TCP       | `open` | MySQL 8.0 / MariaDB                       | **Medio**      | Debe restringirse exclusivamente a `127.0.0.1` para evitar conexiones externas directas. |
| `8080/tcp` | TCP       | `open` | Jenkins CI Server                         | **Bajo**       | Servidor de integración continua en entorno local controlado.                            |

---

## 2. Hallazgos en Cabeceras HTTP (`--script http-headers,http-security-headers`)

Durante la ejecución inicial sobre `http://127.0.0.1:3000` antes del endurecimiento (hardening), Nmap reportó:

1. **Divulgación de Tecnología (`X-Powered-By: Express`):** Facilita el reconocimiento (fingerprinting) por parte de atacantes.
2. **Ausencia de `X-Frame-Options` y `X-Content-Type-Options: nosniff`:** Riesgo de ataques de Clickjacking y MIME-sniffing en la subida de documentos.
3. **Política CORS Abierta (`Access-Control-Allow-Origin: *`):** Permitía peticiones desde cualquier dominio externo sin restricción.
4. **Ausencia de Rate Limiting en `/api/auth/login`:** Vulnerable a ataques de fuerza bruta automatizados sobre credenciales JWT.

---

## 3. Plan de Mitigación Técnica para el Sprint 7

1. **Deshabilitar `x-powered-by`** e integrar el middleware **`helmet`** en `backend/server.js`.
2. **Configurar `express-rate-limit`** con ventana de 15 minutos (máximo 40 intentos en `/api/auth/login` y 300 en `/api/`).
3. **Restringir orígenes permitidos en `cors`** y limitar el tamaño del payload JSON a `2mb`.
4. **Validar tipos MIME y tamaño máximo (5 MB)** en `uploadMiddleware.js` para bloquear ejecución de archivos maliciosos.
