const express = require("express");
const router = express.Router();
const clasificacionController = require("../controllers/clasificacionController");
const { verificarToken } = require("../middleware/authMiddleware");

router.use(verificarToken);

// Simulador rápido de impacto ambiental
router.post("/simular", clasificacionController.simularClasificacion);

// Evaluar y consultar clasificación de una solicitud específica (HU-24, HU-25, HU-26)
router.post(
  "/:solicitudId",
  clasificacionController.evaluarClasificacionAmbiental,
);
router.get(
  "/:solicitudId",
  clasificacionController.obtenerClasificacionAmbiental,
);

module.exports = router;
