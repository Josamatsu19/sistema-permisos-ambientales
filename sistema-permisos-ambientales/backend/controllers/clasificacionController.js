const pool = require("../config/database");

/**
 * Motor de Reglas de Impacto Ambiental (MiAmbiente - Ley 41 de 1998)
 * Calcula puntaje (0 a 100) y determina Categoría I, II o III.
 */
function calcularDictamenAmbiental(datos) {
  let puntaje = 0;
  const razones = [];

  // 1. Extensión del proyecto en hectáreas
  const hectareas = parseFloat(datos.extension_hectareas) || 0;
  if (hectareas > 50) {
    puntaje += 25;
    razones.push(
      `Extensión mayor a 50 ha (${hectareas} ha) genera alteración territorial significativa (+25 pts).`,
    );
  } else if (hectareas >= 10) {
    puntaje += 15;
    razones.push(
      `Extensión intermedia de ${hectareas} ha con impacto moderado de uso de suelo (+15 pts).`,
    );
  } else if (hectareas >= 2) {
    puntaje += 8;
    razones.push(
      `Extensión menor (${hectareas} ha) de impacto localizado (+8 pts).`,
    );
  } else {
    puntaje += 3;
    razones.push(
      `Extensión reducida (${hectareas} ha) de bajo impacto espacial (+3 pts).`,
    );
  }

  // 2. Afectación a cuerpos hídricos
  const mapaHidrico = { ninguna: 0, baja: 5, media: 15, alta: 25 };
  const ptsHidrico = mapaHidrico[datos.afectacion_hidrica] ?? 0;
  puntaje += ptsHidrico;
  if (ptsHidrico >= 15) {
    razones.push(
      `Afectación hídrica ${datos.afectacion_hidrica.toUpperCase()} requiere plan de manejo de cuencas (+${ptsHidrico} pts).`,
    );
  }

  // 3. Afectación forestal y biodiversidad
  const mapaForestal = { ninguna: 0, baja: 5, media: 15, alta: 20 };
  const ptsForestal = mapaForestal[datos.afectacion_forestal] ?? 0;
  puntaje += ptsForestal;
  if (ptsForestal >= 15) {
    razones.push(
      `Intervención sobre cobertura boscosa (${datos.afectacion_forestal.toUpperCase()}) sujeta a compensación ecológica (+${ptsForestal} pts).`,
    );
  }

  // 4. Nivel de emisiones, ruido y efluentes
  const mapaEmisiones = { ninguno: 0, bajo: 4, medio: 10, alto: 15 };
  const ptsEmisiones = mapaEmisiones[datos.nivel_emisiones] ?? 0;
  puntaje += ptsEmisiones;
  if (ptsEmisiones >= 10) {
    razones.push(
      `Emisiones/efluentes de nivel ${datos.nivel_emisiones.toUpperCase()} requieren monitoreo continuo (+${ptsEmisiones} pts).`,
    );
  }

  // 5. Cercanía al Sistema Nacional de Áreas Protegidas (SINAP)
  const mapaAreas = {
    mayor_5km: 0,
    entre_1_5km: 10,
    menor_1km: 20,
    dentro_area: 35,
  };
  const ptsAreas = mapaAreas[datos.cercania_areas_protegidas] ?? 0;
  puntaje += ptsAreas;
  if (
    datos.cercania_areas_protegidas === "dentro_area" ||
    datos.cercania_areas_protegidas === "menor_1km"
  ) {
    razones.push(
      `Proximidad crítica a Área Protegida SINAP (${datos.cercania_areas_protegidas}) (+${ptsAreas} pts).`,
    );
  }

  // 6. Riesgo socioambiental / comunidades cercanas
  const mapaSocial = { bajo: 2, medio: 8, alto: 15 };
  const ptsSocial = mapaSocial[datos.riesgo_social] ?? 2;
  puntaje += ptsSocial;
  if (ptsSocial >= 8) {
    razones.push(
      `Riesgo social ${datos.riesgo_social.toUpperCase()} exige proceso de participación ciudadana (+${ptsSocial} pts).`,
    );
  }

  // 7. Manejo de residuos o sustancias peligrosas
  const residuosPeligrosos = Boolean(
    datos.manejo_residuos_peligrosos === true ||
    datos.manejo_residuos_peligrosos === 1 ||
    datos.manejo_residuos_peligrosos === "1" ||
    datos.manejo_residuos_peligrosos === "true",
  );
  if (residuosPeligrosos) {
    puntaje += 15;
    razones.push("Incluye manejo de residuos/sustancias peligrosas (+15 pts).");
  }

  // Regla de corte directo para Categoría III (impacto crítico dentro de Área Protegida o puntaje >= 65)
  let categoria = "Categoría I";
  let resumenNormativo = "";

  if (
    puntaje >= 65 ||
    datos.cercania_areas_protegidas === "dentro_area" ||
    (datos.afectacion_hidrica === "alta" &&
      datos.afectacion_forestal === "alta")
  ) {
    categoria = "Categoría III";
    resumenNormativo =
      "CATEGORÍA III (Ley 41 de 1998): El proyecto genera impactos ambientales negativos significativos cuantitativos o cualitativos. Requiere Estudio de Impacto Ambiental (EsIA) exhaustivo, Foro Público obligatorio y Plan de Manejo Ambiental detallado.";
  } else if (puntaje >= 30) {
    categoria = "Categoría II";
    resumenNormativo =
      "CATEGORÍA II (Ley 41 de 1998): El proyecto ocasiona impactos ambientales negativos de carácter moderado y localizados, los cuales pueden ser mitigados con medidas de fácil aplicación. Requiere EsIA Categoría II y consulta comunitaria.";
  } else {
    categoria = "Categoría I";
    resumenNormativo =
      "CATEGORÍA I (Ley 41 de 1998): El proyecto no genera impactos ambientales negativos significativos. Requiere Declaración Jurada de Estudio de Impacto Ambiental Categoría I y cumplimiento de Buenas Prácticas Ambientales.";
  }

  const justificacion_tecnica = `${resumenNormativo} Factores ponderados (Puntaje: ${puntaje} pts): ${razones.join(" ")}`;

  return {
    puntaje_total: puntaje,
    categoria_resultante: categoria,
    justificacion_tecnica,
    residuosPeligrosos: residuosPeligrosos ? 1 : 0,
  };
}

/**
 * HU-24 y HU-25: Registrar información ambiental y obtener clasificación preliminar
 * POST /api/solicitudes/:id/clasificacion  o  POST /api/clasificacion/:id
 */
const evaluarClasificacionAmbiental = async (req, res) => {
  try {
    const solicitudId =
      req.params.id || req.params.solicitudId || req.body.solicitud_id;

    if (!solicitudId) {
      return res.status(400).json({
        ok: false,
        mensaje: "Debe proporcionar el ID de la solicitud a clasificar.",
      });
    }

    const [solicitudes] = await pool.query(
      "SELECT * FROM solicitudes WHERE id = ?",
      [solicitudId],
    );
    if (solicitudes.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Solicitud ambiental no encontrada.",
      });
    }

    const solicitud = solicitudes[0];

    // Verificar permisos: el dueño de la solicitud, un evaluador o un admin pueden ejecutar la clasificación
    if (
      req.usuario.rol === "solicitante" &&
      Number(solicitud.usuario_id) !== Number(req.usuario.id)
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tiene permisos para clasificar esta solicitud.",
      });
    }

    const {
      extension_hectareas = 1,
      afectacion_hidrica = "ninguna",
      afectacion_forestal = "ninguna",
      nivel_emisiones = "ninguno",
      cercania_areas_protegidas = "mayor_5km",
      riesgo_social = "bajo",
      manejo_residuos_peligrosos = false,
    } = req.body;

    const resultado = calcularDictamenAmbiental({
      extension_hectareas,
      afectacion_hidrica,
      afectacion_forestal,
      nivel_emisiones,
      cercania_areas_protegidas,
      riesgo_social,
      manejo_residuos_peligrosos,
    });

    // Insertar o actualizar en clasificaciones_ambientales (UPSERT)
    await pool.query(
      `INSERT INTO clasificaciones_ambientales (
        solicitud_id, usuario_id, extension_hectareas, afectacion_hidrica,
        afectacion_forestal, nivel_emisiones, cercania_areas_protegidas,
        riesgo_social, manejo_residuos_peligrosos, puntaje_total,
        categoria_resultante, justificacion_tecnica
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        usuario_id = VALUES(usuario_id),
        extension_hectareas = VALUES(extension_hectareas),
        afectacion_hidrica = VALUES(afectacion_hidrica),
        afectacion_forestal = VALUES(afectacion_forestal),
        nivel_emisiones = VALUES(nivel_emisiones),
        cercania_areas_protegidas = VALUES(cercania_areas_protegidas),
        riesgo_social = VALUES(riesgo_social),
        manejo_residuos_peligrosos = VALUES(manejo_residuos_peligrosos),
        puntaje_total = VALUES(puntaje_total),
        categoria_resultante = VALUES(categoria_resultante),
        justificacion_tecnica = VALUES(justificacion_tecnica),
        fecha_evaluacion = CURRENT_TIMESTAMP`,
      [
        solicitudId,
        req.usuario.id,
        parseFloat(extension_hectareas) || 0,
        afectacion_hidrica,
        afectacion_forestal,
        nivel_emisiones,
        cercania_areas_protegidas,
        riesgo_social,
        resultado.residuosPeligrosos,
        resultado.puntaje_total,
        resultado.categoria_resultante,
        resultado.justificacion_tecnica,
      ],
    );

    // Actualizar campos resumen en la tabla solicitudes
    await pool.query(
      "UPDATE solicitudes SET categoria_ambiental = ?, puntaje_impacto = ? WHERE id = ?",
      [resultado.categoria_resultante, resultado.puntaje_total, solicitudId],
    );

    // Registrar en el historial de auditoría (Sprint 6: HT-16)
    await pool.query(
      `INSERT INTO historial_solicitudes
        (solicitud_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        solicitudId,
        req.usuario.id,
        "Clasificación Ambiental Preliminar",
        solicitud.estado,
        solicitud.estado,
        `Se calculó la clasificación preliminar: ${resultado.categoria_resultante} (${resultado.puntaje_total} pts).`,
      ],
    );

    const [clasificacionGuardada] = await pool.query(
      "SELECT * FROM clasificaciones_ambientales WHERE solicitud_id = ?",
      [solicitudId],
    );

    return res.status(200).json({
      ok: true,
      mensaje: `Clasificación ambiental calculada exitosamente: ${resultado.categoria_resultante}`,
      clasificacion: clasificacionGuardada[0],
    });
  } catch (error) {
    console.error("Error en evaluarClasificacionAmbiental:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al procesar la clasificación ambiental.",
    });
  }
};

/**
 * HU-26: Consultar resultado de clasificación ambiental de una solicitud
 * GET /api/solicitudes/:id/clasificacion  o  GET /api/clasificacion/:id
 */
const obtenerClasificacionAmbiental = async (req, res) => {
  try {
    const solicitudId = req.params.id || req.params.solicitudId;

    const [solicitudes] = await pool.query(
      "SELECT id, usuario_id, nombre_proyecto, categoria_ambiental, puntaje_impacto FROM solicitudes WHERE id = ?",
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
          "No tiene autorización para consultar la clasificación de esta solicitud.",
      });
    }

    const [clasificaciones] = await pool.query(
      `SELECT c.*, u.nombre AS evaluado_por_nombre, u.rol AS evaluado_por_rol
       FROM clasificaciones_ambientales c
       LEFT JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.solicitud_id = ?`,
      [solicitudId],
    );

    if (clasificaciones.length === 0) {
      return res.status(200).json({
        ok: true,
        evaluada: false,
        categoria_ambiental: solicitudes[0].categoria_ambiental || "Pendiente",
        puntaje_impacto: solicitudes[0].puntaje_impacto,
        clasificacion: null,
        mensaje:
          "Esta solicitud aún no cuenta con cuestionario de clasificación ambiental registrado.",
      });
    }

    return res.status(200).json({
      ok: true,
      evaluada: true,
      categoria_ambiental: clasificaciones[0].categoria_resultante,
      puntaje_impacto: clasificaciones[0].puntaje_total,
      clasificacion: clasificaciones[0],
    });
  } catch (error) {
    console.error("Error en obtenerClasificacionAmbiental:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error al consultar la clasificación ambiental.",
    });
  }
};

/**
 * Simulador rápido sin guardar en BD (útil en crear-solicitud antes de persistir)
 * POST /api/clasificacion/simular
 */
const simularClasificacion = (req, res) => {
  try {
    const resultado = calcularDictamenAmbiental(req.body || {});
    return res.status(200).json({
      ok: true,
      simulacion: resultado,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mensaje: "Error al simular clasificación ambiental.",
    });
  }
};

module.exports = {
  calcularDictamenAmbiental,
  evaluarClasificacionAmbiental,
  obtenerClasificacionAmbiental,
  simularClasificacion,
};
