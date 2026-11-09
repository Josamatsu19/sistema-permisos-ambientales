const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
require("dotenv").config();

const JWT_SECRET =
  process.env.JWT_SECRET || "miambiente_secreto_super_seguro_ley41_2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

const ROLES_VALIDOS = ["solicitante", "evaluador", "admin"];

/**
 * HU-02: Registrar un nuevo usuario
 */
const registrarUsuario = async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({
        ok: false,
        mensaje: "Todos los campos (nombre, email, password) son obligatorios.",
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalizado)) {
      return res.status(400).json({
        ok: false,
        mensaje: "El formato del correo electrónico no es válido.",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        ok: false,
        mensaje: "La contraseña debe tener al menos 6 caracteres.",
      });
    }

    const [existentes] = await pool.query(
      "SELECT id FROM usuarios WHERE email = ?",
      [emailNormalizado],
    );
    if (existentes.length > 0) {
      return res.status(409).json({
        ok: false,
        mensaje: "El correo electrónico ya está registrado en el sistema.",
      });
    }

    const rolAsignado = ROLES_VALIDOS.includes(rol) ? rol : "solicitante";
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [resultado] = await pool.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)",
      [nombre.trim(), emailNormalizado, passwordHash, rolAsignado],
    );

    const nuevoUsuario = {
      id: resultado.insertId,
      nombre: nombre.trim(),
      email: emailNormalizado,
      rol: rolAsignado,
    };

    const token = jwt.sign(nuevoUsuario, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(201).json({
      ok: true,
      mensaje: "Usuario registrado exitosamente.",
      token,
      usuario: nuevoUsuario,
    });
  } catch (error) {
    console.error("Error en registrarUsuario:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno del servidor al registrar el usuario.",
    });
  }
};

/**
 * HU-03: Iniciar sesión y obtener token JWT
 */
const iniciarSesion = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        mensaje: "Por favor ingrese correo electrónico y contraseña.",
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const [usuarios] = await pool.query(
      "SELECT id, nombre, email, password, rol, activo FROM usuarios WHERE email = ?",
      [emailNormalizado],
    );

    if (usuarios.length === 0) {
      return res.status(401).json({
        ok: false,
        mensaje: "Credenciales inválidas.",
      });
    }

    const usuario = usuarios[0];

    if (usuario.activo === 0) {
      return res.status(403).json({
        ok: false,
        mensaje:
          "La cuenta de usuario se encuentra desactivada. Contacte al administrador.",
      });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({
        ok: false,
        mensaje: "Credenciales inválidas.",
      });
    }

    const payload = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol || "solicitante",
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(200).json({
      ok: true,
      mensaje: "Inicio de sesión exitoso.",
      token,
      usuario: payload,
    });
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno del servidor al iniciar sesión.",
    });
  }
};

/**
 * HU-04: Consultar perfil del usuario autenticado
 */
const obtenerPerfil = async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      "SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios WHERE id = ?",
      [req.usuario.id],
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Usuario no encontrado.",
      });
    }

    return res.status(200).json({
      ok: true,
      usuario: usuarios[0],
    });
  } catch (error) {
    console.error("Error en obtenerPerfil:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener el perfil del usuario.",
    });
  }
};

/**
 * Sprint 5 - HU-21 / HU-22: Listar todos los usuarios (Solo Admin / Evaluador)
 */
const listarUsuarios = async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      "SELECT id, nombre, email, rol, activo, fecha_creacion FROM usuarios ORDER BY id ASC",
    );

    return res.status(200).json({
      ok: true,
      total: usuarios.length,
      usuarios,
    });
  } catch (error) {
    console.error("Error en listarUsuarios:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al listar los usuarios del sistema.",
    });
  }
};

/**
 * Sprint 5 - HU-21: Asignar o cambiar el rol de un usuario (Solo Admin)
 */
const actualizarRolUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { rol, activo } = req.body;

    if (rol && !ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({
        ok: false,
        mensaje: `Rol no válido. Los roles permitidos son: ${ROLES_VALIDOS.join(", ")}.`,
      });
    }

    const [usuarios] = await pool.query(
      "SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?",
      [id],
    );
    if (usuarios.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "El usuario especificado no existe.",
      });
    }

    const nuevoRol = rol || usuarios[0].rol;
    const nuevoEstadoActivo =
      typeof activo !== "undefined" ? (activo ? 1 : 0) : usuarios[0].activo;

    await pool.query("UPDATE usuarios SET rol = ?, activo = ? WHERE id = ?", [
      nuevoRol,
      nuevoEstadoActivo,
      id,
    ]);

    return res.status(200).json({
      ok: true,
      mensaje: `Rol del usuario actualizado correctamente a '${nuevoRol}'.`,
      usuario: {
        id: Number(id),
        nombre: usuarios[0].nombre,
        email: usuarios[0].email,
        rol: nuevoRol,
        activo: Boolean(nuevoEstadoActivo),
      },
    });
  } catch (error) {
    console.error("Error en actualizarRolUsuario:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al actualizar el rol del usuario.",
    });
  }
};

module.exports = {
  registrarUsuario,
  iniciarSesion,
  obtenerPerfil,
  listarUsuarios,
  actualizarRolUsuario,
  // Alias para compatibilidad con nombres en inglés si alguna ruta los invoca
  register: registrarUsuario,
  login: iniciarSesion,
  getProfile: obtenerPerfil,
};
