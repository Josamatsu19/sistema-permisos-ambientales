const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const solicitudRoutes = require("./routes/solicitudRoutes");
const documentoRoutes = require("./routes/documentoRoutes");
const clasificacionRoutes = require("./routes/clasificacionRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Mitigación SecOps (Sprint 6 & 7 - HT-20 / HT-22): Ocultar firma tecnológica y cabeceras HTTP seguras
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false, // Permite scripts inline controlados y fuentes de Google en el frontend
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);

// 2. Configuración CORS segura
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:5500"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== "production"
      ) {
        callback(null, true);
      } else {
        callback(new Error("No permitido por política CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// 3. Rate Limiting contra ataques de fuerza bruta y DoS (Sprint 7 - HT-22)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    mensaje:
      "Demasiadas peticiones desde esta dirección IP. Intente nuevamente en 15 minutos.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    mensaje:
      "Demasiados intentos de autenticación. Por seguridad, espere 15 minutos.",
  },
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);

// 4. Parseo de JSON y formularios con límite de tamaño de payload
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// 5. Archivos estáticos (Uploads y Frontend)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "frontend")));

// 6. Endpoint de salud para monitoreo y Pipeline CI/CD (Jenkins HE-07)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    servicio: "Sistema de Permisos Ambientales - MiAmbiente",
    version: "2.0.0-Sprint7",
    timestamp: new Date().toISOString(),
  });
});

// 7. Montaje de Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/solicitudes", solicitudRoutes);
app.use("/api/documentos", documentoRoutes);
app.use("/api/clasificacion", clasificacionRoutes);

// 8. Ruta raíz dirige al login del Frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

// 9. Middleware global de manejo de errores (incluyendo errores de Multer)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      ok: false,
      mensaje: "El archivo excede el tamaño máximo permitido de 5 MB.",
    });
  }

  if (err.message && err.message.includes("Formato de archivo no permitido")) {
    return res.status(400).json({
      ok: false,
      mensaje: err.message,
    });
  }

  console.error("Error no controlado:", err.message);
  return res.status(500).json({
    ok: false,
    mensaje: err.message || "Error interno del servidor.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `🚀 Servidor MiAmbiente ejecutándose en http://localhost:${PORT}`,
    );
  });
}

module.exports = app;
