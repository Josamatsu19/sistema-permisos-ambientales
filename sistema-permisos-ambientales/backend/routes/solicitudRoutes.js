const express = require("express");
const router = express.Router();
const solicitudController = require("../controllers/solicitudController");
const documentoController = require("../controllers/documentoController");
const clasificacionController = require("../controllers/clasificacionController");
const {
  verificarToken,
  autorizarRoles,
} = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// Todas las rutas de solicitudes requieren autenticación JWT
router.use(verificarToken);

// Sprint 4 (HU-13): Bandeja de solicitudes pendientes de revisión (Evaluador / Admin)
router.get(
  "/pendientes/revision",
  autorizarRoles("evaluador", "admin"),
  solicitudController.listarPendientesRevision,
);

// Sprint 2 (HU-05, HU-08): Crear y listar solicitudes
router.post("/", solicitudController.crearSolicitud);
router.get("/", solicitudController.listarSolicitudes);

// Sprint 2 (HU-06, HU-07) y Sprint 3 (HU-12): Obtener detalle, editar y consultar estado
router.get("/:id", solicitudController.obtenerSolicitudPorId);
router.put("/:id", solicitudController.actualizarSolicitud);
router.get("/:id/estado", solicitudController.consultarEstadoSolicitud);

// Sprint 4 (HU-14, HU-17): Revisar solicitud y cambiar estado (Evaluador / Admin)
router.patch(
  "/:id/estado",
  autorizarRoles("evaluador", "admin"),
  solicitudController.actualizarEstadoSolicitud,
);
router.put(
  "/:id/estado",
  autorizarRoles("evaluador", "admin"),
  solicitudController.actualizarEstadoSolicitud,
);

// Sprint 4 (HU-15, HU-16) y Sprint 6 (HT-18): Observaciones y subsanaciones
router.get("/:id/observaciones", solicitudController.listarObservaciones);
router.post(
  "/:id/observaciones",
  autorizarRoles("evaluador", "admin"),
  solicitudController.agregarObservacion,
);
router.patch(
  "/:id/observaciones/:observacionId/resolver",
  solicitudController.resolverObservacion,
);

// Sprint 5 (HU-18, HU-19, HU-20): Checklist de requisitos y progreso
router.get("/:id/checklist", solicitudController.obtenerChecklist);
router.patch(
  "/:id/checklist/:requisitoId",
  solicitudController.actualizarItemChecklist,
);
router.put(
  "/:id/checklist/:requisitoId",
  solicitudController.actualizarItemChecklist,
);

// Sprint 6 (HU-23, HT-16, HT-17, HT-18): Historial y trazabilidad de la solicitud
router.get("/:id/historial", solicitudController.obtenerHistorialSolicitud);

// Sprint 3 (HU-09, HU-10): Subir y listar documentos directamente desde /api/solicitudes/:id/documentos
router.get("/:id/documentos", documentoController.listarDocumentosPorSolicitud);
router.post(
  "/:id/documentos",
  upload.single("archivo"),
  documentoController.subirDocumento,
);

// Sprint 7 (HU-24, HU-25, HU-26): Clasificación Ambiental Preliminar
router.post(
  "/:id/clasificacion",
  clasificacionController.evaluarClasificacionAmbiental,
);
router.get(
  "/:id/clasificacion",
  clasificacionController.obtenerClasificacionAmbiental,
);

module.exports = router;
