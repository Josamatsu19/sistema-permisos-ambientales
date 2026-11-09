const fs = require("fs");
const path = require("path");
const pool = require("../config/database");
const { registrarHistorial } = require("./solicitudController");

/**
 * Sprint 3 - HU-09 y HT-12: Adjuntar documento a una solicitud
 */
const subirDocumento = async (req, res) => {
  try {
    const solicitudId =
      req.params.solicitudId || req.params.id || req.body.solicitud_id;
    const tipoDocumento = req.body.tipo_documento || "Anexo Técnico";

    if (!solicitudId) {
      return res.status(400).json({
        ok: false,
        mensaje: "Se requiere el ID de la solicitud (solicitud_id).",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "No se ha adjuntado ningún archivo válido (PDF, JPG o PNG máx. 5 MB).",
      });
    }

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [solicitudId],
    );
    if (solicitudes.length === 0) {
      // Eliminar archivo huérfano si la solicitud no existe
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        ok: false,
        mensaje: "La solicitud ambiental indicada no existe.",
      });
    }

    const solicitud = solicitudes[0];

    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitud.usuario_id) !== Number(req.usuario.id)
    ) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({
        ok: false,
        mensaje:
          "No tiene autorización para adjuntar documentos a esta solicitud.",
      });
    }

    const rutaRelativa = `/uploads/${req.file.filename}`;

    const [resultado] = await pool.query(
      `INSERT INTO documentos
        (solicitud_id, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano_bytes, tipo_documento, subido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        solicitudId,
        req.file.originalname,
        req.file.filename,
        rutaRelativa,
        req.file.mimetype,
        req.file.size,
        tipoDocumento,
        req.usuario.id,
      ],
    );

    await registrarHistorial({
      solicitud_id: solicitudId,
      usuario_id: req.usuario.id,
      accion: "Carga de Documento Adjunto",
      estado_anterior: solicitud.estado,
      estado_nuevo: solicitud.estado,
      detalle: `Se adjuntó el documento "${req.file.originalname}" (${tipoDocumento}, ${Math.round(
        req.file.size / 1024,
      )} KB).`,
      ip_origen: req.ip,
    });

    const [docInsertado] = await pool.query(
      "SELECT * FROM documentos WHERE id = ?",
      [resultado.insertId],
    );

    return res.status(201).json({
      ok: true,
      mensaje: "Documento adjuntado exitosamente.",
      documento: docInsertado[0],
    });
  } catch (error) {
    console.error("Error en subirDocumento:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al subir el documento.",
    });
  }
};

/**
 * Sprint 3 - HU-10: Consultar documentos adjuntos de una solicitud
 */
const listarDocumentosPorSolicitud = async (req, res) => {
  try {
    const solicitudId = req.params.solicitudId || req.params.id;

    const [solicitudes] = await pool.query(
      "SELECT id, usuario_id FROM solicitudes WHERE id = ?",
      [solicitudId],
    );

    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitudes[0].usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje:
          "No autorizado para consultar los documentos de esta solicitud.",
      });
    }

    const [documentos] = await pool.query(
      `SELECT d.*, u.nombre AS subido_por_nombre
       FROM documentos d
       LEFT JOIN usuarios u ON d.subido_por = u.id
       WHERE d.solicitud_id = ?
       ORDER BY d.fecha_subida DESC`,
      [solicitudId],
    );

    return res.status(200).json({
      ok: true,
      total: documentos.length,
      documentos,
    });
  } catch (error) {
    console.error("Error en listarDocumentosPorSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar los documentos adjuntos.",
    });
  }
};

/**
 * Sprint 3 - HU-10: Descargar archivo físico de un documento
 */
const descargarDocumento = async (req, res) => {
  try {
    const { id } = req.params;

    const [docs] = await pool.query(
      `SELECT d.*, s.usuario_id AS propietario_id
       FROM documentos d
       INNER JOIN solicitudes s ON d.solicitud_id = s.id
       WHERE d.id = ?`,
      [id],
    );

    if (docs.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Documento no encontrado.",
      });
    }

    const doc = docs[0];

    if (
      req.usuario.rol === "solicitante" &&
      Number(doc.propietario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No autorizado para descargar este documento.",
      });
    }

    const filePath = path.join(__dirname, "..", "uploads", doc.nombre_archivo);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        mensaje: "El archivo físico no se encuentra en el servidor.",
      });
    }

    return res.download(filePath, doc.nombre_original);
  } catch (error) {
    console.error("Error en descargarDocumento:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al descargar el documento.",
    });
  }
};

/**
 * Sprint 3 - HU-11: Eliminar un documento permitido
 */
const eliminarDocumento = async (req, res) => {
  try {
    const { id } = req.params;

    const [docs] = await pool.query(
      `SELECT d.*, s.usuario_id AS propietario_id, s.estado AS solicitud_estado
       FROM documentos d
       INNER JOIN solicitudes s ON d.solicitud_id = s.id
       WHERE d.id = ?`,
      [id],
    );

    if (docs.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "El documento no existe.",
      });
    }

    const doc = docs[0];

    if (
      req.usuario.rol === "solicitante" &&
      Number(doc.propietario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tiene permiso para eliminar este documento.",
      });
    }

    if (
      req.usuario.rol === "solicitante" &&
      ["Aprobada", "Rechazada"].includes(doc.solicitud_estado)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: `No se pueden eliminar documentos de una solicitud en estado '${doc.solicitud_estado}'.`,
      });
    }

    const filePath = path.join(__dirname, "..", "uploads", doc.nombre_archivo);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await pool.query("DELETE FROM documentos WHERE id = ?", [id]);

    await registrarHistorial({
      solicitud_id: doc.solicitud_id,
      usuario_id: req.usuario.id,
      accion: "Eliminación de Documento",
      estado_anterior: doc.solicitud_estado,
      estado_nuevo: doc.solicitud_estado,
      detalle: `Se eliminó el documento "${doc.nombre_original}" (ID #${id}).`,
      ip_origen: req.ip,
    });

    return res.status(200).json({
      ok: true,
      mensaje: "Documento eliminado correctamente.",
    });
  } catch (error) {
    console.error("Error en eliminarDocumento:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al eliminar el documento.",
    });
  }
};

module.exports = {
  subirDocumento,
  listarDocumentosPorSolicitud,
  descargarDocumento,
  eliminarDocumento,
};
