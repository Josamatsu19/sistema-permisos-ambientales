const API_URL = "/api";
let solicitudIdActual = null;
let usuarioActual = null;

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const usuarioStr = localStorage.getItem("usuario");

  if (!token || !usuarioStr) {
    window.location.href = "login.html";
    return;
  }

  usuarioActual = JSON.parse(usuarioStr);
  document.getElementById("navUsuarioDetalle").textContent =
    `${usuarioActual.nombre} (${usuarioActual.rol})`;

  const params = new URLSearchParams(window.location.search);
  solicitudIdActual = params.get("id");

  if (!solicitudIdActual) {
    window.location.href = "dashboard.html";
    return;
  }

  if (usuarioActual.rol === "evaluador" || usuarioActual.rol === "admin") {
    document.getElementById("panelEvaluadorRevision").style.display = "block";
  }

  document
    .getElementById("formEditarSolicitud")
    .addEventListener("submit", actualizarDatosProyecto);
  document
    .getElementById("formClasificacion")
    .addEventListener("submit", guardarClasificacion);
  document
    .getElementById("formSubirDocumento")
    .addEventListener("submit", subirDocumentoAdjunto);
  document
    .getElementById("formCambiarEstado")
    .addEventListener("submit", cambiarEstadoExpediente);
  document
    .getElementById("formNuevaObservacion")
    .addEventListener("submit", registrarObservacion);
  document
    .getElementById("btnRefrescarHistorial")
    .addEventListener("click", cargarHistorial);

  cargarExpedienteCompleto();
  cargarHistorial();
});

function mostrarAlerta(mensaje, tipo = "error") {
  const alerta = document.getElementById("alertaDetalle");
  alerta.textContent = mensaje;
  alerta.className = `alert ${tipo === "success" ? "alert-success" : "alert-error"}`;
  alerta.style.display = "block";
  setTimeout(() => {
    alerta.style.display = "none";
  }, 4500);
}

function claseBadgeEstado(estado) {
  const norm = String(estado || "Enviada")
    .replace("ó", "o")
    .replace(/\s+/g, "-");
  return `badge estado-${norm}`;
}

function claseBadgeCategoria(cat) {
  if (cat === "Categoría I") return "badge cat-I";
  if (cat === "Categoría II") return "badge cat-II";
  if (cat === "Categoría III") return "badge cat-III";
  return "badge cat-Pendiente";
}

async function cargarExpedienteCompleto() {
  const token = localStorage.getItem("token");

  try {
    const res = await fetch(`${API_URL}/solicitudes/${solicitudIdActual}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      mostrarAlerta(data.mensaje || "No se pudo cargar la solicitud.");
      return;
    }

    const s = data.solicitud;
    document.getElementById("tituloExpediente").textContent =
      `Expediente #${s.id}: ${s.nombre_proyecto}`;
    document.getElementById("subtituloExpediente").textContent =
      `Promotor: ${s.solicitante_nombre} (${s.solicitante_email}) • Creado: ${new Date(
        s.fecha_creacion,
      ).toLocaleString()}`;

    const badgeEst = document.getElementById("badgeEstadoActual");
    badgeEst.textContent = `Estado: ${s.estado}`;
    badgeEst.className = claseBadgeEstado(s.estado);

    const badgeCat = document.getElementById("badgeCategoriaActual");
    badgeCat.textContent =
      s.puntaje_impacto !== null
        ? `${s.categoria_ambiental} (${s.puntaje_impacto} pts)`
        : s.categoria_ambiental || "Pendiente";
    badgeCat.className = claseBadgeCategoria(s.categoria_ambiental);

    // Llenar formulario de datos del proyecto
    document.getElementById("edit_nombre_proyecto").value = s.nombre_proyecto;
    document.getElementById("edit_sector").value = s.sector;
    document.getElementById("edit_ubicacion").value = s.ubicacion;
    document.getElementById("edit_tipo_permiso").value = s.tipo_permiso;
    document.getElementById("edit_descripcion").value = s.descripcion;
    document.getElementById("nuevo_estado_revision").value = s.estado;

    // Llenar clasificación ambiental si existe
    if (data.clasificacion_ambiental) {
      const c = data.clasificacion_ambiental;
      document.getElementById("clas_hectareas").value = c.extension_hectareas;
      document.getElementById("clas_hidrica").value = c.afectacion_hidrica;
      document.getElementById("clas_forestal").value = c.afectacion_forestal;
      document.getElementById("clas_emisiones").value = c.nivel_emisiones;
      document.getElementById("clas_areas").value = c.cercania_areas_protegidas;
      document.getElementById("clas_social").value = c.riesgo_social;
      document.getElementById("clas_residuos").checked = Boolean(
        c.manejo_residuos_peligrosos,
      );
      document.getElementById("textoDictamenClasificacion").innerHTML = `
        <b>Resultado Oficial Preliminar: ${c.categoria_resultante} (${c.puntaje_total} pts)</b><br/>
        <span>${c.justificacion_tecnica}</span>
      `;
    }

    renderizarDocumentos(data.documentos || []);
    renderizarChecklist(data.checklist || [], data.progreso_checklist);
    renderizarObservaciones(data.observaciones || []);
  } catch (error) {
    mostrarAlerta("Error al cargar los datos del expediente.");
  }
}

async function actualizarDatosProyecto(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");

  const payload = {
    nombre_proyecto: document
      .getElementById("edit_nombre_proyecto")
      .value.trim(),
    sector: document.getElementById("edit_sector").value.trim(),
    ubicacion: document.getElementById("edit_ubicacion").value.trim(),
    tipo_permiso: document.getElementById("edit_tipo_permiso").value.trim(),
    descripcion: document.getElementById("edit_descripcion").value.trim(),
  };

  try {
    const res = await fetch(`${API_URL}/solicitudes/${solicitudIdActual}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      mostrarAlerta(
        "Datos del proyecto actualizados correctamente.",
        "success",
      );
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "No se pudo actualizar la solicitud.");
    }
  } catch (error) {
    mostrarAlerta("Error al guardar los cambios.");
  }
}

async function guardarClasificacion(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");

  const payload = {
    extension_hectareas:
      parseFloat(document.getElementById("clas_hectareas").value) || 0,
    afectacion_hidrica: document.getElementById("clas_hidrica").value,
    afectacion_forestal: document.getElementById("clas_forestal").value,
    nivel_emisiones: document.getElementById("clas_emisiones").value,
    cercania_areas_protegidas: document.getElementById("clas_areas").value,
    riesgo_social: document.getElementById("clas_social").value,
    manejo_residuos_peligrosos:
      document.getElementById("clas_residuos").checked,
  };

  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/clasificacion`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      mostrarAlerta(data.mensaje, "success");
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "Error al calcular clasificación.");
    }
  } catch (error) {
    mostrarAlerta("Error de conexión al evaluar clasificación.");
  }
}

function renderizarDocumentos(documentos) {
  const contenedor = document.getElementById("listaDocumentos");
  if (documentos.length === 0) {
    contenedor.innerHTML = `<p style="color: var(--muted); font-size: 0.9rem;">No hay documentos adjuntos todavía.</p>`;
    return;
  }

  contenedor.innerHTML = documentos
    .map(
      (doc) => `
      <div class="checklist-item">
        <div>
          <b>📄 ${doc.nombre_original}</b><br/>
          <small style="color: var(--muted);">
            ${doc.tipo_documento} • ${Math.round((doc.tamano_bytes || 0) / 1024)} KB • ${new Date(
              doc.fecha_subida,
            ).toLocaleString()}
          </small>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <a href="${doc.ruta_archivo}" target="_blank" class="btn btn-secondary btn-sm">Ver</a>
          <button class="btn btn-danger btn-sm" onclick="eliminarDocumento(${doc.id})">Eliminar</button>
        </div>
      </div>
    `,
    )
    .join("");
}

async function subirDocumentoAdjunto(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  const inputArchivo = document.getElementById("archivo_adjunto");
  const tipoDoc = document.getElementById("tipo_documento").value;

  if (!inputArchivo.files.length) return;

  const formData = new FormData();
  formData.append("archivo", inputArchivo.files[0]);
  formData.append("tipo_documento", tipoDoc);

  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/documentos`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      inputArchivo.value = "";
      mostrarAlerta("Documento adjuntado exitosamente.", "success");
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "Error al adjuntar documento.");
    }
  } catch (error) {
    mostrarAlerta("Error al subir archivo.");
  }
}

window.eliminarDocumento = async function (docId) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_URL}/documentos/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      mostrarAlerta("Documento eliminado correctamente.", "success");
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "No se pudo eliminar el documento.");
    }
  } catch (error) {
    mostrarAlerta("Error al eliminar documento.");
  }
};

function renderizarChecklist(items, progreso) {
  const pct = progreso ? progreso.porcentaje_avance : 0;
  document.getElementById("badgeProgresoChecklist").textContent = `${pct}% (${
    progreso ? progreso.requisitos_cumplidos : 0
  }/${progreso ? progreso.total_requisitos : 0})`;
  document.getElementById("barraProgresoChecklist").style.width = `${pct}%`;

  const contenedor = document.getElementById("contenedorChecklist");
  contenedor.innerHTML = items
    .map(
      (item) => `
      <div class="checklist-item ${Number(item.cumplido) === 1 ? "cumplido" : ""}">
        <div>
          <label style="display: flex; align-items: flex-start; gap: 0.6rem; cursor: pointer;">
            <input
              type="checkbox"
              ${Number(item.cumplido) === 1 ? "checked" : ""}
              onchange="alternarRequisitoChecklist(${item.id}, this.checked)"
              style="margin-top: 0.25rem;"
            />
            <span>
              <b>[${item.codigo_requisito}] ${item.nombre_requisito}</b><br/>
              <small style="color: var(--muted);">${item.descripcion_requisito || ""}</small>
            </span>
          </label>
        </div>
        <span class="badge ${Number(item.cumplido) === 1 ? "estado-Aprobada" : "estado-Con-Observaciones"}">
          ${Number(item.cumplido) === 1 ? "Cumplido" : "Pendiente"}
        </span>
      </div>
    `,
    )
    .join("");
}

window.alternarRequisitoChecklist = async function (requisitoId, cumplido) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/checklist/${requisitoId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cumplido }),
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      renderizarChecklist(data.checklist, data.progreso);
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "Error al actualizar requisito.");
    }
  } catch (error) {
    mostrarAlerta("Error al actualizar el checklist.");
  }
};

function renderizarObservaciones(observaciones) {
  const contenedor = document.getElementById("listaObservaciones");
  if (observaciones.length === 0) {
    contenedor.innerHTML = `<p style="color: var(--muted); font-size: 0.9rem;">No existen observaciones registradas para esta solicitud.</p>`;
    return;
  }

  contenedor.innerHTML = observaciones
    .map(
      (obs) => `
      <div class="checklist-item ${Number(obs.resuelta) === 1 ? "cumplido" : ""}">
        <div>
          <span class="badge ${
            Number(obs.resuelta) === 1
              ? "estado-Aprobada"
              : "estado-Con-Observaciones"
          }">${obs.tipo}</span>
          <b style="margin-left: 0.4rem;">${obs.autor_nombre} (${obs.autor_rol})</b>
          <small style="color: var(--muted); margin-left: 0.4rem;">${new Date(
            obs.fecha_creacion,
          ).toLocaleString()}</small>
          <p style="margin-top: 0.35rem; font-size: 0.92rem;">${obs.comentario}</p>
        </div>
        <div>
          <button
            class="btn ${Number(obs.resuelta) === 1 ? "btn-secondary" : "btn-primary"} btn-sm"
            onclick="marcarObservacionResuelta(${obs.id}, ${Number(obs.resuelta) === 1 ? "false" : "true"})"
          >
            ${Number(obs.resuelta) === 1 ? "Reabrir" : "✔ Marcar Subsanada"}
          </button>
        </div>
      </div>
    `,
    )
    .join("");
}

async function cambiarEstadoExpediente(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  const estado = document.getElementById("nuevo_estado_revision").value;
  const comentario = document
    .getElementById("comentario_dictamen")
    .value.trim();

  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/estado`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado, comentario }),
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      document.getElementById("comentario_dictamen").value = "";
      mostrarAlerta(data.mensaje, "success");
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "Error al cambiar estado.");
    }
  } catch (error) {
    mostrarAlerta("Error al cambiar estado.");
  }
}

async function registrarObservacion(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  const tipo = document.getElementById("tipo_observacion").value;
  const comentario = document
    .getElementById("comentario_observacion")
    .value.trim();

  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/observaciones`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tipo, comentario }),
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      document.getElementById("comentario_observacion").value = "";
      mostrarAlerta(
        "Observación registrada y trazabilidad actualizada.",
        "success",
      );
      cargarExpedienteCompleto();
      cargarHistorial();
    } else {
      mostrarAlerta(data.mensaje || "Error al registrar observación.");
    }
  } catch (error) {
    mostrarAlerta("Error al registrar observación.");
  }
}

window.marcarObservacionResuelta = async function (obsId, resuelta) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/observaciones/${obsId}/resolver`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resuelta }),
      },
    );
    const data = await res.json();
    if (res.ok && data.ok) {
      mostrarAlerta(data.mensaje, "success");
      cargarExpedienteCompleto();
      cargarHistorial();
    }
  } catch (error) {
    mostrarAlerta("Error al actualizar observación.");
  }
};

async function cargarHistorial() {
  const token = localStorage.getItem("token");
  const contenedor = document.getElementById("contenedorHistorial");

  try {
    const res = await fetch(
      `${API_URL}/solicitudes/${solicitudIdActual}/historial`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();

    if (!res.ok || !data.ok) {
      contenedor.innerHTML = `<p style="color: var(--muted);">No se pudo cargar el historial.</p>`;
      return;
    }

    if (!data.historial || data.historial.length === 0) {
      contenedor.innerHTML = `<p style="color: var(--muted);">Sin registros en la bitácora.</p>`;
      return;
    }

    contenedor.innerHTML = data.historial
      .map(
        (h) => `
        <div class="timeline-item">
          <div class="timeline-meta">
            <span><b>${h.accion}</b> • Por: ${h.usuario_nombre} (${h.usuario_rol})</span>
            <span>${new Date(h.fecha_registro).toLocaleString()}</span>
          </div>
          ${
            h.estado_anterior || h.estado_nuevo
              ? `<div style="font-size: 0.8rem; margin-bottom: 0.25rem;">
                   Transición: <b>${h.estado_anterior || "Inicial"}</b> ➔ <b>${h.estado_nuevo || "-"}</b>
                 </div>`
              : ""
          }
          <p style="font-size: 0.88rem; color: var(--text);">${h.detalle}</p>
        </div>
      `,
      )
      .join("");
  } catch (error) {
    contenedor.innerHTML = `<p style="color: var(--muted);">Error de conexión al cargar historial.</p>`;
  }
}
