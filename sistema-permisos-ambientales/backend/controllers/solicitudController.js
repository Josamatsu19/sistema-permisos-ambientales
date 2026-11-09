const pool = require("../config/database");
const { calcularDictamenAmbiental } = require("./clasificacionController");

const ESTADOS_VALIDOS = [
  "Borrador",
  "Enviada",
  "En Revisión",
  "Con Observaciones",
  "Aprobada",
  "Rechazada",
];

const PLANTILLA_CHECKLIST_MIAMBIENTE = [
  {
    codigo: "REQ-01",
    nombre: "Formulario Oficial de Solicitud y Declaración Jurada",
    descripcion:
      "Documento firmado por el promotor y el consultor ambiental registrado ante MiAmbiente.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-02",
    nombre: "Certificación de Registro Público / Cédula del Promotor",
    descripcion:
      "Acreditación legal vigente de la persona natural o jurídica titular del proyecto.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-03",
    nombre: "Plano de Ubicación Georreferenciado (Coordenadas UTM)",
    descripcion:
      "Polígono del área de influencia directa e indirecta y colindancia con áreas SINAP.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-04",
    nombre: "Línea Base Física, Biótica y Socioeconómica",
    descripcion:
      "Inventario de recursos hídricos, flora, fauna y comunidades dentro del área de estudio.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-05",
    nombre: "Plan de Manejo Ambiental (PMA) y Plan de Contingencia",
    descripcion:
      "Medidas de mitigación, compensación ambiental, manejo de desechos y cronograma.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-06",
    nombre: "Constancia de Participación Ciudadana / Consulta Pública",
    descripcion:
      "Evidencia de encuestas, entrevistas o acta de foro público según categoría del EsIA.",
    obligatorio: 1,
  },
  {
    codigo: "REQ-07",
    nombre: "Comprobante de Pago de Tasa de Evaluación Ambiental",
    descripcion:
      "Recibo oficial emitido por el Ministerio de Ambiente según tarifa vigente.",
    obligatorio: 1,
  },
];

/**
 * Helper Sprint 6 (HT-16, HT-17, HT-18): Registrar evento en historial_solicitudes
 */
async function registrarHistorial({
  solicitud_id,
  usuario_id,
  accion,
  estado_anterior = null,
  estado_nuevo = null,
  detalle,
  ip_origen = null,
}) {
  try {
    await pool.query(
      `INSERT INTO historial_solicitudes
        (solicitud_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        solicitud_id,
        usuario_id,
        accion,
        estado_anterior,
        estado_nuevo,
        detalle,
        ip_origen,
      ],
    );
  } catch (error) {
    console.error("Error al escribir en historial_solicitudes:", error.message);
  }
}

/**
 * Helper Sprint 5 (HU-18): Asegurar que una solicitud tenga su checklist inicializado
 */
async function asegurarChecklistInicial(solicitudId) {
  const [existentes] = await pool.query(
    "SELECT COUNT(*) AS total FROM checklist_requisitos WHERE solicitud_id = ?",
    [solicitudId],
  );

  if (existentes[0].total === 0) {
    const valores = PLANTILLA_CHECKLIST_MIAMBIENTE.map((item) => [
      solicitudId,
      item.codigo,
      item.nombre,
      item.descripcion,
      item.obligatorio,
      0,
    ]);

    await pool.query(
      `INSERT INTO checklist_requisitos
        (solicitud_id, codigo_requisito, nombre_requisito, descripcion_requisito, obligatorio, cumplido)
       VALUES ?`,
      [valores],
    );
  }
}

/**
 * Helper Sprint 5 (HU-20): Calcular el resumen de progreso del checklist
 */
function calcularProgresoChecklist(items) {
  const total = items.length;
  const cumplidos = items.filter((item) => Number(item.cumplido) === 1).length;
  const obligatorios = items.filter((item) => Number(item.obligatorio) === 1);
  const obligatoriosCumplidos = obligatorios.filter(
    (item) => Number(item.cumplido) === 1,
  ).length;
  const porcentaje = total > 0 ? Math.round((cumplidos / total) * 100) : 0;

  return {
    total_requisitos: total,
    requisitos_cumplidos: cumplidos,
    requisitos_pendientes: total - cumplidos,
    obligatorios_totales: obligatorios.length,
    obligatorios_cumplidos: obligatoriosCumplidos,
    listo_para_aprobacion:
      obligatorios.length > 0 && obligatoriosCumplidos === obligatorios.length,
    porcentaje_avance: porcentaje,
  };
}

/**
 * Sprint 2 - HU-05: Crear una solicitud ambiental (con soporte opcional para cuestionario Sprint 7)
 */
const crearSolicitud = async (req, res) => {
  try {
    const {
      nombre_proyecto,
      descripcion,
      ubicacion,
      sector,
      tipo_permiso,
      cuestionario_ambiental,
    } = req.body;

    if (!nombre_proyecto || !descripcion || !ubicacion || !sector) {
      return res.status(400).json({
        ok: false,
        mensaje:
          "Los campos nombre_proyecto, descripcion, ubicacion y sector son obligatorios.",
      });
    }

    const permiso = tipo_permiso || "Estudio de Impacto Ambiental (EsIA)";
    const estadoInicial = "Enviada";

    const [resultado] = await pool.query(
      `INSERT INTO solicitudes
        (usuario_id, nombre_proyecto, descripcion, ubicacion, sector, tipo_permiso, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.usuario.id,
        nombre_proyecto.trim(),
        descripcion.trim(),
        ubicacion.trim(),
        sector.trim(),
        permiso,
        estadoInicial,
      ],
    );

    const solicitudId = resultado.insertId;

    // Inicializar checklist de requisitos (Sprint 5)
    await asegurarChecklistInicial(solicitudId);

    // Registrar creación en bitácora de auditoría (Sprint 6)
    await registrarHistorial({
      solicitud_id: solicitudId,
      usuario_id: req.usuario.id,
      accion: "Creación de Solicitud",
      estado_anterior: null,
      estado_nuevo: estadoInicial,
      detalle: `Solicitud creada para el proyecto "${nombre_proyecto.trim()}" en el sector ${sector.trim()}.`,
      ip_origen: req.ip,
    });

    // Si en el mismo formulario enviaron datos de clasificación ambiental (Sprint 7: HU-24, HU-25)
    let dictamenClasificacion = null;
    if (cuestionario_ambiental && typeof cuestionario_ambiental === "object") {
      const calc = calcularDictamenAmbiental(cuestionario_ambiental);

      await pool.query(
        `INSERT INTO clasificaciones_ambientales (
          solicitud_id, usuario_id, extension_hectareas, afectacion_hidrica,
          afectacion_forestal, nivel_emisiones, cercania_areas_protegidas,
          riesgo_social, manejo_residuos_peligrosos, puntaje_total,
          categoria_resultante, justificacion_tecnica
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          solicitudId,
          req.usuario.id,
          parseFloat(cuestionario_ambiental.extension_hectareas) || 0,
          cuestionario_ambiental.afectacion_hidrica || "ninguna",
          cuestionario_ambiental.afectacion_forestal || "ninguna",
          cuestionario_ambiental.nivel_emisiones || "ninguno",
          cuestionario_ambiental.cercania_areas_protegidas || "mayor_5km",
          cuestionario_ambiental.riesgo_social || "bajo",
          calc.residuosPeligrosos,
          calc.puntaje_total,
          calc.categoria_resultante,
          calc.justificacion_tecnica,
        ],
      );

      await pool.query(
        "UPDATE solicitudes SET categoria_ambiental = ?, puntaje_impacto = ? WHERE id = ?",
        [calc.categoria_resultante, calc.puntaje_total, solicitudId],
      );

      await registrarHistorial({
        solicitud_id: solicitudId,
        usuario_id: req.usuario.id,
        accion: "Clasificación Ambiental Preliminar",
        estado_anterior: estadoInicial,
        estado_nuevo: estadoInicial,
        detalle: `Clasificación preliminar calculada al crear la solicitud: ${calc.categoria_resultante} (${calc.puntaje_total} pts).`,
        ip_origen: req.ip,
      });

      dictamenClasificacion = calc;
    }

    const [solicitudCreada] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [solicitudId],
    );

    return res.status(201).json({
      ok: true,
      mensaje: "Solicitud ambiental creada exitosamente.",
      solicitud: solicitudCreada[0],
      clasificacion: dictamenClasificacion,
    });
  } catch (error) {
    console.error("Error en crearSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al crear la solicitud ambiental.",
    });
  }
};

/**
 * Sprint 2 - HU-08 y Sprint 4 - HU-13: Listar solicitudes
 * - Si el usuario es 'solicitante', lista únicamente sus propias solicitudes.
 * - Si el usuario es 'evaluador' o 'admin', lista todas las solicitudes con filtros opcionales (?estado=...).
 */
const listarSolicitudes = async (req, res) => {
  try {
    const { estado, sector, categoria_ambiental } = req.query;
    const parametros = [];
    const condiciones = [];

    if (req.usuario.rol === "solicitante") {
      condiciones.push("s.usuario_id = ?");
      parametros.push(req.usuario.id);
    }

    if (estado) {
      condiciones.push("s.estado = ?");
      parametros.push(estado);
    }

    if (sector) {
      condiciones.push("s.sector = ?");
      parametros.push(sector);
    }

    if (categoria_ambiental) {
      condiciones.push("s.categoria_ambiental = ?");
      parametros.push(categoria_ambiental);
    }

    const whereClause =
      condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    const [solicitudes] = await pool.query(
      `SELECT s.*,
              u.nombre AS solicitante_nombre,
              u.email AS solicitante_email,
              (SELECT COUNT(*) FROM documentos d WHERE d.solicitud_id = s.id) AS total_documentos,
              (SELECT COUNT(*) FROM observaciones_solicitud o WHERE o.solicitud_id = s.id) AS total_observaciones,
              (SELECT COUNT(*) FROM checklist_requisitos c WHERE c.solicitud_id = s.id AND c.cumplido = 1) AS requisitos_cumplidos,
              (SELECT COUNT(*) FROM checklist_requisitos c WHERE c.solicitud_id = s.id) AS requisitos_totales
       FROM solicitudes s
       INNER JOIN usuarios u ON s.usuario_id = u.id
       ${whereClause}
       ORDER BY s.fecha_creacion DESC`,
      parametros,
    );

    const solicitudesConProgreso = solicitudes.map((sol) => {
      const totalReq = Number(sol.requisitos_totales) || 0;
      const cumpReq = Number(sol.requisitos_cumplidos) || 0;
      return {
        ...sol,
        porcentaje_checklist:
          totalReq > 0 ? Math.round((cumpReq / totalReq) * 100) : 0,
      };
    });

    return res.status(200).json({
      ok: true,
      total: solicitudesConProgreso.length,
      solicitudes: solicitudesConProgreso,
    });
  } catch (error) {
    console.error("Error en listarSolicitudes:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener la lista de solicitudes.",
    });
  }
};

/**
 * Sprint 4 - HU-13: Consultar solicitudes pendientes de revisión (Evaluador / Admin)
 */
const listarPendientesRevision = async (req, res) => {
  try {
    const [solicitudes] = await pool.query(
      `SELECT s.*,
              u.nombre AS solicitante_nombre,
              u.email AS solicitante_email,
              (SELECT COUNT(*) FROM documentos d WHERE d.solicitud_id = s.id) AS total_documentos,
              (SELECT COUNT(*) FROM observaciones_solicitud o WHERE o.solicitud_id = s.id AND o.resuelta = 0) AS observaciones_abiertas
       FROM solicitudes s
       INNER JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.estado IN ('Enviada', 'En Revisión', 'Con Observaciones')
       ORDER BY s.fecha_actualizacion ASC`,
    );

    return res.status(200).json({
      ok: true,
      total: solicitudes.length,
      solicitudes,
    });
  } catch (error) {
    console.error("Error en listarPendientesRevision:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar las solicitudes pendientes de revisión.",
    });
  }
};

/**
 * Sprint 2 - HU-06 / Sprint 3 - HU-12: Consultar el detalle integral de una solicitud
 */
const obtenerSolicitudPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [solicitudes] = await pool.query(
      `SELECT s.*, u.nombre AS solicitante_nombre, u.email AS solicitante_email
       FROM solicitudes s
       INNER JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.id = ?`,
      [id],
    );

    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "La solicitud ambiental no existe.",
      });
    }

    const solicitud = solicitudes[0];

    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitud.usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tiene autorización para acceder a esta solicitud.",
      });
    }

    await asegurarChecklistInicial(id);

    const [documentos] = await pool.query(
      "SELECT * FROM documentos WHERE solicitud_id = ? ORDER BY fecha_subida DESC",
      [id],
    );

    const [observaciones] = await pool.query(
      `SELECT o.*, u.nombre AS autor_nombre, u.rol AS autor_rol
       FROM observaciones_solicitud o
       INNER JOIN usuarios u ON o.usuario_id = u.id
       WHERE o.solicitud_id = ?
       ORDER BY o.fecha_creacion DESC`,
      [id],
    );

    const [checklist] = await pool.query(
      `SELECT c.*, u.nombre AS verificado_por_nombre
       FROM checklist_requisitos c
       LEFT JOIN usuarios u ON c.verificado_por = u.id
       WHERE c.solicitud_id = ?
       ORDER BY c.id ASC`,
      [id],
    );

    const [clasificaciones] = await pool.query(
      "SELECT * FROM clasificaciones_ambientales WHERE solicitud_id = ?",
      [id],
    );

    return res.status(200).json({
      ok: true,
      solicitud,
      documentos,
      observaciones,
      checklist,
      progreso_checklist: calcularProgresoChecklist(checklist),
      clasificacion_ambiental: clasificaciones[0] || null,
    });
  } catch (error) {
    console.error("Error en obtenerSolicitudPorId:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar el detalle de la solicitud.",
    });
  }
};

/**
 * Sprint 2 - HU-07: Editar una solicitud ambiental y registrar cambios en el historial (HT-16)
 */
const actualizarSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_proyecto, descripcion, ubicacion, sector, tipo_permiso } =
      req.body;

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );
    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    const solicitudActual = solicitudes[0];

    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitudActual.usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tiene permiso para editar esta solicitud.",
      });
    }

    if (
      req.usuario.rol === "solicitante" &&
      ["Aprobada", "Rechazada"].includes(solicitudActual.estado)
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: `No se puede editar una solicitud que ya se encuentra en estado '${solicitudActual.estado}'.`,
      });
    }

    const nuevoNombre = nombre_proyecto
      ? nombre_proyecto.trim()
      : solicitudActual.nombre_proyecto;
    const nuevaDescripcion = descripcion
      ? descripcion.trim()
      : solicitudActual.descripcion;
    const nuevaUbicacion = ubicacion
      ? ubicacion.trim()
      : solicitudActual.ubicacion;
    const nuevoSector = sector ? sector.trim() : solicitudActual.sector;
    const nuevoTipoPermiso = tipo_permiso
      ? tipo_permiso.trim()
      : solicitudActual.tipo_permiso;

    // Detectar qué campos cambiaron para dejar trazabilidad detallada (Sprint 6: HT-16)
    const cambiosDetectados = [];
    if (nuevoNombre !== solicitudActual.nombre_proyecto) {
      cambiosDetectados.push(
        `nombre_proyecto: "${solicitudActual.nombre_proyecto}" -> "${nuevoNombre}"`,
      );
    }
    if (nuevaUbicacion !== solicitudActual.ubicacion) {
      cambiosDetectados.push(
        `ubicacion: "${solicitudActual.ubicacion}" -> "${nuevaUbicacion}"`,
      );
    }
    if (nuevoSector !== solicitudActual.sector) {
      cambiosDetectados.push(
        `sector: "${solicitudActual.sector}" -> "${nuevoSector}"`,
      );
    }
    if (nuevoTipoPermiso !== solicitudActual.tipo_permiso) {
      cambiosDetectados.push(
        `tipo_permiso: "${solicitudActual.tipo_permiso}" -> "${nuevoTipoPermiso}"`,
      );
    }
    if (nuevaDescripcion !== solicitudActual.descripcion) {
      cambiosDetectados.push("descripcion actualizada");
    }

    await pool.query(
      `UPDATE solicitudes
       SET nombre_proyecto = ?, descripcion = ?, ubicacion = ?, sector = ?, tipo_permiso = ?
       WHERE id = ?`,
      [
        nuevoNombre,
        nuevaDescripcion,
        nuevaUbicacion,
        nuevoSector,
        nuevoTipoPermiso,
        id,
      ],
    );

    await registrarHistorial({
      solicitud_id: id,
      usuario_id: req.usuario.id,
      accion: "Edición de Datos del Proyecto",
      estado_anterior: solicitudActual.estado,
      estado_nuevo: solicitudActual.estado,
      detalle:
        cambiosDetectados.length > 0
          ? `Campos modificados: ${cambiosDetectados.join("; ")}.`
          : "Actualización general de la solicitud sin cambios de estado.",
      ip_origen: req.ip,
    });

    const [actualizada] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );

    return res.status(200).json({
      ok: true,
      mensaje: "Solicitud actualizada correctamente.",
      solicitud: actualizada[0],
    });
  } catch (error) {
    console.error("Error en actualizarSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al actualizar la solicitud.",
    });
  }
};

/**
 * Sprint 3 - HU-12: Consultar estado específico de una solicitud
 */
const consultarEstadoSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const [filas] = await pool.query(
      "SELECT id, usuario_id, nombre_proyecto, estado, categoria_ambiental, puntaje_impacto, fecha_actualizacion FROM solicitudes WHERE id = ?",
      [id],
    );

    if (filas.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    if (
      req.usuario.rol === "solicitante" &&
      Number(filas[0].usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No autorizado para consultar el estado de esta solicitud.",
      });
    }

    return res.status(200).json({
      ok: true,
      estado_solicitud: filas[0],
    });
  } catch (error) {
    console.error("Error en consultarEstadoSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar el estado de la solicitud.",
    });
  }
};

/**
 * Sprint 4 - HU-14 y HU-17 / Sprint 6 - HT-17: Revisar solicitud y cambiar estado (Evaluador / Admin)
 */
const actualizarEstadoSolicitud = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentario, motivo } = req.body;
    const justificacion = comentario || motivo || "";

    if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({
        ok: false,
        mensaje: `Estado inválido. Estados permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      });
    }

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );
    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    const solicitudActual = solicitudes[0];
    const estadoAnterior = solicitudActual.estado;

    await pool.query(
      "UPDATE solicitudes SET estado = ?, evaluador_asignado_id = ? WHERE id = ?",
      [estado, req.usuario.id, id],
    );

    // Si se incluye un comentario/dictamen al cambiar el estado, lo guardamos también en observaciones
    if (justificacion.trim().length > 0) {
      await pool.query(
        `INSERT INTO observaciones_solicitud (solicitud_id, usuario_id, tipo, comentario)
         VALUES (?, ?, 'Dictamen de Evaluación', ?)`,
        [id, req.usuario.id, justificacion.trim()],
      );
    }

    // Registrar cambio de estado en bitácora (Sprint 6: HT-17)
    await registrarHistorial({
      solicitud_id: id,
      usuario_id: req.usuario.id,
      accion: "Cambio de Estado por Revisión",
      estado_anterior: estadoAnterior,
      estado_nuevo: estado,
      detalle: justificacion.trim()
        ? `Estado cambiado de '${estadoAnterior}' a '${estado}'. Dictamen: ${justificacion.trim()}`
        : `Estado cambiado de '${estadoAnterior}' a '${estado}' por ${req.usuario.nombre} (${req.usuario.rol}).`,
      ip_origen: req.ip,
    });

    const [solicitudActualizada] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );

    return res.status(200).json({
      ok: true,
      mensaje: `El estado de la solicitud se actualizó a '${estado}'.`,
      solicitud: solicitudActualizada[0],
    });
  } catch (error) {
    console.error("Error en actualizarEstadoSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al actualizar el estado de la solicitud.",
    });
  }
};

/**
 * Sprint 4 - HU-15 / Sprint 6 - HT-18: Registrar una observación técnica en una solicitud
 */
const agregarObservacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { comentario, tipo, cambiar_estado } = req.body;

    if (!comentario || String(comentario).trim().length === 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "El comentario de la observación es obligatorio.",
      });
    }

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );
    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    const solicitud = solicitudes[0];
    const tiposValidos = [
      "Observación Técnica",
      "Requerimiento Legal",
      "Subsanación",
      "Dictamen de Evaluación",
    ];
    const tipoObservacion = tiposValidos.includes(tipo)
      ? tipo
      : "Observación Técnica";

    const [resultado] = await pool.query(
      `INSERT INTO observaciones_solicitud (solicitud_id, usuario_id, tipo, comentario)
       VALUES (?, ?, ?, ?)`,
      [id, req.usuario.id, tipoObservacion, comentario.trim()],
    );

    let estadoNuevo = solicitud.estado;
    if (cambiar_estado && ESTADOS_VALIDOS.includes(cambiar_estado)) {
      estadoNuevo = cambiar_estado;
      await pool.query("UPDATE solicitudes SET estado = ? WHERE id = ?", [
        estadoNuevo,
        id,
      ]);
    } else if (
      req.usuario.rol !== "solicitante" &&
      solicitud.estado === "Enviada"
    ) {
      estadoNuevo = "Con Observaciones";
      await pool.query("UPDATE solicitudes SET estado = ? WHERE id = ?", [
        estadoNuevo,
        id,
      ]);
    }

    // Trazabilidad de observaciones en bitácora (Sprint 6: HT-18)
    await registrarHistorial({
      solicitud_id: id,
      usuario_id: req.usuario.id,
      accion: `Registro de ${tipoObservacion}`,
      estado_anterior: solicitud.estado,
      estado_nuevo: estadoNuevo,
      detalle: `Observación #${resultado.insertId}: "${comentario.trim()}"`,
      ip_origen: req.ip,
    });

    const [nuevaObs] = await pool.query(
      `SELECT o.*, u.nombre AS autor_nombre, u.rol AS autor_rol
       FROM observaciones_solicitud o
       INNER JOIN usuarios u ON o.usuario_id = u.id
       WHERE o.id = ?`,
      [resultado.insertId],
    );

    return res.status(201).json({
      ok: true,
      mensaje: "Observación registrada correctamente.",
      observacion: nuevaObs[0],
      estado_solicitud: estadoNuevo,
    });
  } catch (error) {
    console.error("Error en agregarObservacion:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al registrar la observación.",
    });
  }
};

/**
 * Sprint 4 - HU-16: Consultar todas las observaciones de una solicitud
 */
const listarObservaciones = async (req, res) => {
  try {
    const { id } = req.params;

    const [solicitudes] = await pool.query(
      "SELECT id, usuario_id FROM solicitudes WHERE id = ?",
      [id],
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
        mensaje: "No autorizado para ver las observaciones de esta solicitud.",
      });
    }

    const [observaciones] = await pool.query(
      `SELECT o.*, u.nombre AS autor_nombre, u.rol AS autor_rol
       FROM observaciones_solicitud o
       INNER JOIN usuarios u ON o.usuario_id = u.id
       WHERE o.solicitud_id = ?
       ORDER BY o.fecha_creacion DESC`,
      [id],
    );

    return res.status(200).json({
      ok: true,
      total: observaciones.length,
      observaciones,
    });
  } catch (error) {
    console.error("Error en listarObservaciones:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al obtener las observaciones.",
    });
  }
};

/**
 * Sprint 6 - HT-18: Marcar una observación como resuelta/subsanada
 */
const resolverObservacion = async (req, res) => {
  try {
    const { id, observacionId } = req.params;
    const { resuelta = true, comentario_resolucion } = req.body;

    const [obs] = await pool.query(
      "SELECT * FROM observaciones_solicitud WHERE id = ? AND solicitud_id = ?",
      [observacionId, id],
    );

    if (obs.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Observación no encontrada para esta solicitud.",
      });
    }

    const estadoResuelta = resuelta ? 1 : 0;
    await pool.query(
      `UPDATE observaciones_solicitud
       SET resuelta = ?, fecha_resolucion = IF(? = 1, CURRENT_TIMESTAMP, NULL)
       WHERE id = ?`,
      [estadoResuelta, estadoResuelta, observacionId],
    );

    const [solicitudes] = await pool.query(
      "SELECT estado FROM solicitudes WHERE id = ?",
      [id],
    );
    const estadoActual = solicitudes[0] ? solicitudes[0].estado : null;

    await registrarHistorial({
      solicitud_id: id,
      usuario_id: req.usuario.id,
      accion: estadoResuelta
        ? "Observación Subsanada"
        : "Observación Reabierta",
      estado_anterior: estadoActual,
      estado_nuevo: estadoActual,
      detalle: `Observación #${observacionId} marcada como ${estadoResuelta ? "RESUELTA" : "PENDIENTE"}.${
        comentario_resolucion ? " Nota: " + comentario_resolucion : ""
      }`,
      ip_origen: req.ip,
    });

    return res.status(200).json({
      ok: true,
      mensaje: `Observación marcada como ${estadoResuelta ? "resuelta" : "pendiente"}.`,
    });
  } catch (error) {
    console.error("Error en resolverObservacion:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al actualizar el estado de la observación.",
    });
  }
};

/**
 * Sprint 5 - HU-18 y HU-20: Consultar checklist de requisitos y barra de progreso
 */
const obtenerChecklist = async (req, res) => {
  try {
    const { id } = req.params;

    const [solicitudes] = await pool.query(
      "SELECT id, usuario_id FROM solicitudes WHERE id = ?",
      [id],
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
        mensaje: "No autorizado para consultar el checklist de esta solicitud.",
      });
    }

    await asegurarChecklistInicial(id);

    const [checklist] = await pool.query(
      `SELECT c.*, u.nombre AS verificado_por_nombre
       FROM checklist_requisitos c
       LEFT JOIN usuarios u ON c.verificado_por = u.id
       WHERE c.solicitud_id = ?
       ORDER BY c.id ASC`,
      [id],
    );

    const progreso = calcularProgresoChecklist(checklist);

    return res.status(200).json({
      ok: true,
      solicitud_id: Number(id),
      progreso,
      checklist,
    });
  } catch (error) {
    console.error("Error en obtenerChecklist:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar el checklist de requisitos.",
    });
  }
};

/**
 * Sprint 5 - HU-19: Marcar un requisito del checklist como cumplido / no cumplido
 */
const actualizarItemChecklist = async (req, res) => {
  try {
    const { id, requisitoId } = req.params;
    const { cumplido, observacion_verificacion } = req.body;

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [id],
    );
    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud no encontrada.",
      });
    }

    const solicitud = solicitudes[0];

    // Tanto el evaluador/admin como el solicitante (mientras prepara o subsana su solicitud) pueden marcar requisitos
    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitud.usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tiene permisos sobre esta solicitud.",
      });
    }

    const [items] = await pool.query(
      "SELECT * FROM checklist_requisitos WHERE id = ? AND solicitud_id = ?",
      [requisitoId, id],
    );

    if (items.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "El requisito especificado no pertenece a esta solicitud.",
      });
    }

    const itemActual = items[0];
    const nuevoEstadoCumplido =
      typeof cumplido !== "undefined"
        ? cumplido
          ? 1
          : 0
        : itemActual.cumplido
          ? 0
          : 1;
    const nuevaObs =
      typeof observacion_verificacion !== "undefined"
        ? observacion_verificacion
        : itemActual.observacion_verificacion;

    await pool.query(
      `UPDATE checklist_requisitos
       SET cumplido = ?,
           observacion_verificacion = ?,
           verificado_por = ?,
           fecha_verificacion = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nuevoEstadoCumplido, nuevaObs, req.usuario.id, requisitoId],
    );

    await registrarHistorial({
      solicitud_id: id,
      usuario_id: req.usuario.id,
      accion: "Actualización de Checklist",
      estado_anterior: solicitud.estado,
      estado_nuevo: solicitud.estado,
      detalle: `Requisito ${itemActual.codigo_requisito} (${itemActual.nombre_requisito}) marcado como ${
        nuevoEstadoCumplido ? "CUMPLIDO" : "PENDIENTE"
      }.`,
      ip_origen: req.ip,
    });

    const [checklistActualizado] = await pool.query(
      `SELECT c.*, u.nombre AS verificado_por_nombre
       FROM checklist_requisitos c
       LEFT JOIN usuarios u ON c.verificado_por = u.id
       WHERE c.solicitud_id = ?
       ORDER BY c.id ASC`,
      [id],
    );

    return res.status(200).json({
      ok: true,
      mensaje: `Requisito ${itemActual.codigo_requisito} actualizado correctamente.`,
      progreso: calcularProgresoChecklist(checklistActualizado),
      checklist: checklistActualizado,
    });
  } catch (error) {
    console.error("Error en actualizarItemChecklist:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al actualizar el requisito del checklist.",
    });
  }
};

/**
 * Sprint 6 - HU-23, HT-16, HT-17, HT-18: Consultar historial y trazabilidad completa de una solicitud
 */
const obtenerHistorialSolicitud = async (req, res) => {
  try {
    const { id } = req.params;

    const [solicitudes] = await pool.query(
      "SELECT id, usuario_id, nombre_proyecto, estado, categoria_ambiental, fecha_creacion FROM solicitudes WHERE id = ?",
      [id],
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
        mensaje: "No autorizado para consultar el historial de esta solicitud.",
      });
    }

    const [historial] = await pool.query(
      `SELECT h.*,
              COALESCE(u.nombre, 'Sistema') AS usuario_nombre,
              COALESCE(u.rol, 'sistema') AS usuario_rol
       FROM historial_solicitudes h
       LEFT JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.solicitud_id = ?
       ORDER BY h.fecha_registro DESC, h.id DESC`,
      [id],
    );

    return res.status(200).json({
      ok: true,
      solicitud: solicitudes[0],
      total_eventos: historial.length,
      historial,
    });
  } catch (error) {
    console.error("Error en obtenerHistorialSolicitud:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar el historial de la solicitud.",
    });
  }
};

module.exports = {
  registrarHistorial,
  crearSolicitud,
  listarSolicitudes,
  listarPendientesRevision,
  obtenerSolicitudPorId,
  actualizarSolicitud,
  consultarEstadoSolicitud,
  actualizarEstadoSolicitud,
  agregarObservacion,
  listarObservaciones,
  resolverObservacion,
  obtenerChecklist,
  actualizarItemChecklist,
  obtenerHistorialSolicitud,
};
