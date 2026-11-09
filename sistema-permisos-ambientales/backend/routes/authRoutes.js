const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
  verificarToken,
  autorizarRoles,
} = require("../middleware/authMiddleware");

// Sprint 1: Registro, Login y Perfil (HU-02, HU-03, HU-04)
router.post("/registro", authController.registrarUsuario);
router.post("/register", authController.registrarUsuario);
router.post("/login", authController.iniciarSesion);
router.get("/perfil", verificarToken, authController.obtenerPerfil);
router.get("/profile", verificarToken, authController.obtenerPerfil);

// Sprint 5: Gestión de Usuarios y Roles (HU-21, HU-22, HT-15)
router.get(
  "/usuarios",
  verificarToken,
  autorizarRoles("admin", "evaluador"),
  authController.listarUsuarios,
);
router.put(
  "/usuarios/:id/rol",
  verificarToken,
  autorizarRoles("admin"),
  authController.actualizarRolUsuario,
);

module.exports = router;
