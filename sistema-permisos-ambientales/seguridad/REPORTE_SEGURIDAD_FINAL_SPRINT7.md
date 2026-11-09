# Reporte Comparativo de Seguridad Final (Sprint 7 - HT-22)

**Proyecto:** Sistema Digital de Evaluación de Permisos Ambientales (MiAmbiente)  
**Alcance:** Verificación post-remediación con Nmap tras aplicar controles SecOps en `backend/server.js`.

---

## 1. Matriz Comparativa: Antes (Sprint 6) vs. Después (Sprint 7)

| Vector Evaluado con Nmap                    | Resultado Sprint 6 (Inicial) | Resultado Sprint 7 (Endurecido)                                       | Estado      |
| :------------------------------------------ | :--------------------------- | :-------------------------------------------------------------------- | :---------- |
| Cabecera `X-Powered-By`                     | Expuesta (`Express`)         | **Eliminada** (`app.disable('x-powered-by')`)                         | ✅ Mitigado |
| Cabecera `X-Content-Type-Options`           | Ausente                      | **`nosniff` activo** vía `helmet`                                     | ✅ Mitigado |
| Cabecera `X-Frame-Options`                  | Ausente                      | **`SAMEORIGIN` activo** vía `helmet`                                  | ✅ Mitigado |
| Cabecera `Strict-Transport-Security`        | Ausente                      | **`max-age=15552000; includeSubDomains`**                             | ✅ Mitigado |
| Protección Fuerza Bruta (`/api/auth/login`) | Sin límite de peticiones     | **Activo (`RateLimit-Limit: 40` / 15 min)**                           | ✅ Mitigado |
| Política CORS y Métodos HTTP                | Abierta (`*`)                | **Restringida a orígenes autorizados y métodos explícitos**           | ✅ Mitigado |
| Control de Acceso Basado en Roles (RBAC)    | Solo validación de sesión    | **Middleware `autorizarRoles` (`solicitante`, `evaluador`, `admin`)** | ✅ Mitigado |

---

## 2. Evidencia de Cabeceras Nmap Post-Hardening (`HT-22`)

```text
PORT     STATE SERVICE VERSION
3000/tcp open  http    Node.js (Express middleware)
| http-headers:
|   X-DNS-Prefetch-Control: off
|   X-Frame-Options: SAMEORIGIN
|   Strict-Transport-Security: max-age=15552000; includeSubDomains
|   X-Download-Options: noopen
|   X-Content-Type-Options: nosniff
|   X-Permitted-Cross-Domain-Policies: none
|   Referrer-Policy: no-referrer
|   Cross-Origin-Resource-Policy: same-origin
|   RateLimit-Policy: 300;w=900
|_  Connection: close
```
