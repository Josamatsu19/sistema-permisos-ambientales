const express = require("express");
const router = express.Router();
const documentoController = require("../controllers/documentoController");
const { verificarToken } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.use(verificarToken);

// Sprint 3: HU-09, HU-10, HU-11
router.post(
  "/solicitud/:solicitudId",
  upload.single("archivo"),
  documentoController.subirDocumento,
);
router.post(
  "/upload/:solicitudId",
  upload.single("archivo"),
  documentoController.subirDocumento,
);
router.get(
  "/solicitud/:solicitudId",
  documentoController.listarDocumentosPorSolicitud,
);
router.get("/:id/descargar", documentoController.descargarDocumento);
router.delete("/:id", documentoController.eliminarDocumento);

module.exports = router;
