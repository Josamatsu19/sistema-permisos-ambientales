const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SECRET =
  process.env.JWT_SECRET || "miambiente_secreto_super_seguro_ley41_2026";

/**
 * Middleware principal para verificar token JWT (HT-04, HT-05)
 */
const verificarToken = (req, res, next) => {
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        mensaje:
          "Acceso denegado. No se proporcionó un token de autenticación válido.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.usuario = {
      id: decoded.id,
      nombre: decoded.nombre,
      email: decoded.email,
      rol: decoded.rol || "solicitante",
    };

    // Alias de compatibilidad por si algún controlador previo usa req.user
    req.user = req.usuario;

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      mensaje:
        "Token inválido o expirado. Por favor, inicie sesión nuevamente.",
    });
  }
};

/**
 * Middleware de autorización por roles (Sprint 5: HT-15, HU-22)
 * @param  {...string} rolesPermitidos - Ej: 'evaluador', 'admin'
 */
const autorizarRoles = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        ok: false,
        mensaje: "Usuario no autenticado.",
      });
    }

    // Si se pasa un array como primer argumento, lo aplanamos
    const roles = rolesPermitidos.flat();

    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        ok: false,
        mensaje: `Acceso restringido. Se requiere uno de los siguientes roles: [${roles.join(", ")}]. Rol actual: ${req.usuario.rol}.`,
      });
    }

    next();
  };
};

// Exportación dual para mantener retrocompatibilidad
verificarToken.verificarToken = verificarToken;
verificarToken.authMiddleware = verificarToken;
verificarToken.autorizarRoles = autorizarRoles;

module.exports = verificarToken;
