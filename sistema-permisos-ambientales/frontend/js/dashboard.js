const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const usuarioGuardado = localStorage.getItem("usuario");

  if (!token || !usuarioGuardado) {
    window.location.href = "login.html";
    return;
  }

  const usuario = JSON.parse(usuarioGuardado);
  document.getElementById("navNombreUsuario").textContent = usuario.nombre;
  document.getElementById("navRolUsuario").textContent = usuario.rol;

  const btnVerPendientes = document.getElementById("btnVerPendientes");
  const seccionAdminUsuarios = document.getElementById("seccionAdminUsuarios");

  if (usuario.rol === "evaluador" || usuario.rol === "admin") {
    btnVerPendientes.style.display = "inline-flex";
  }

  if (usuario.rol === "admin") {
    seccionAdminUsuarios.style.display = "block";
    cargarUsuariosAdmin();
  }

  document.getElementById("btnCerrarSesion").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = "login.html";
  });

  document
    .getElementById("btnAplicarFiltros")
    .addEventListener("click", () => cargarSolicitudes());
  document.getElementById("btnLimpiarFiltros").addEventListener("click", () => {
    document.getElementById("filtroEstado").value = "";
    document.getElementById("filtroCategoria").value = "";
    cargarSolicitudes();
  });

  btnVerPendientes.addEventListener("click", () => cargarPendientesRevision());

  cargarSolicitudes();
});

function mostrarAlerta(mensaje, tipo = "error") {
  const alerta = document.getElementById("alertaDashboard");
  alerta.textContent = mensaje;
  alerta.className = `alert ${tipo === "success" ? "alert-success" : "alert-error"}`;
  alerta.style.display = "block";
  setTimeout(() => {
    alerta.style.display = "none";
  }, 4500);
}

function claseBadgeEstado(estado) {
  const normalizado = String(estado || "Enviada")
    .replace("ó", "o")
    .replace(/\s+/g, "-");
  return `badge estado-${normalizado}`;
}

function claseBadgeCategoria(categoria) {
  if (categoria === "Categoría I") return "badge cat-I";
  if (categoria === "Categoría II") return "badge cat-II";
  if (categoria === "Categoría III") return "badge cat-III";
  return "badge cat-Pendiente";
}

async function cargarSolicitudes() {
  const token = localStorage.getItem("token");
  const estado = document.getElementById("filtroEstado").value;
  const categoria = document.getElementById("filtroCategoria").value;

  const params = new URLSearchParams();
  if (estado) params.append("estado", estado);
  if (categoria) params.append("categoria_ambiental", categoria);

  try {
    const res = await fetch(`${API_URL}/solicitudes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      mostrarAlerta(data.mensaje || "Error al cargar solicitudes.");
      return;
    }

    renderizarTablaSolicitudes(data.solicitudes || []);
    actualizarKPIs(data.solicitudes || []);
  } catch (error) {
    mostrarAlerta("Error de comunicación con el servidor.");
  }
}

async function cargarPendientesRevision() {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_URL}/solicitudes/pendientes/revision`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      renderizarTablaSolicitudes(data.solicitudes || []);
      mostrarAlerta(
        `Mostrando ${data.total} solicitudes pendientes de revisión técnica (HU-13).`,
        "success",
      );
    }
  } catch (error) {
    mostrarAlerta("Error al consultar pendientes de revisión.");
  }
}

function actualizarKPIs(solicitudes) {
  document.getElementById("kpiTotal").textContent = solicitudes.length;
  document.getElementById("kpiPendientes").textContent = solicitudes.filter(
    (s) => ["Enviada", "En Revisión"].includes(s.estado),
  ).length;
  document.getElementById("kpiObservaciones").textContent = solicitudes.filter(
    (s) => s.estado === "Con Observaciones",
  ).length;
  document.getElementById("kpiAprobadas").textContent = solicitudes.filter(
    (s) => s.estado === "Aprobada",
  ).length;
}

function renderizarTablaSolicitudes(solicitudes) {
  const tbody = document.getElementById("tablaSolicitudes");

  if (solicitudes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: var(--muted);">
          No se encontraron solicitudes ambientales registradas con los filtros actuales.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = solicitudes
    .map((s) => {
      const porcentaje = s.porcentaje_checklist ?? 0;
      const puntajeTexto =
        s.puntaje_impacto !== null && typeof s.puntaje_impacto !== "undefined"
          ? ` (${s.puntaje_impacto} pts)`
          : "";

      return `
        <tr>
          <td><b>#${s.id}</b></td>
          <td>
            <b>${s.nombre_proyecto}</b><br/>
            <small style="color: var(--muted);">${s.sector} • ${s.ubicacion}</small>
          </td>
          <td>
            ${s.solicitante_nombre || "Usuario"}<br/>
            <small style="color: var(--muted);">${s.solicitante_email || ""}</small>
          </td>
          <td><span class="${claseBadgeEstado(s.estado)}">${s.estado}</span></td>
          <td>
            <span class="${claseBadgeCategoria(s.categoria_ambiental)}">
              ${s.categoria_ambiental || "Pendiente"}${puntajeTexto}
            </span>
          </td>
          <td style="min-width: 140px;">
            <small><b>${porcentaje}%</b> completado</small>
            <div class="progress-wrap">
              <div class="progress-bar" style="width: ${porcentaje}%;"></div>
            </div>
          </td>
          <td>
            📎 ${s.total_documentos || 0} docs<br/>
            💬 ${s.total_observaciones ?? s.observaciones_abiertas ?? 0} obs
          </td>
          <td>
            <a href="editar-solicitud.html?id=${s.id}" class="btn btn-primary btn-sm">
              Gestionar / Expediente
            </a>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function cargarUsuariosAdmin() {
  const token = localStorage.getItem("token");
  const tbody = document.getElementById("tablaUsuariosAdmin");

  try {
    const res = await fetch(`${API_URL}/auth/usuarios`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return;

    tbody.innerHTML = data.usuarios
      .map(
        (u) => `
        <tr>
          <td>#${u.id}</td>
          <td><b>${u.nombre}</b></td>
          <td>${u.email}</td>
          <td><span class="badge estado-Enviada">${u.rol}</span></td>
          <td>
            <div style="display: flex; gap: 0.4rem;">
              <select id="selectRol_${u.id}" class="form-control" style="max-width: 160px; padding: 0.3rem;">
                <option value="solicitante" ${u.rol === "solicitante" ? "selected" : ""}>solicitante</option>
                <option value="evaluador" ${u.rol === "evaluador" ? "selected" : ""}>evaluador</option>
                <option value="admin" ${u.rol === "admin" ? "selected" : ""}>admin</option>
              </select>
              <button class="btn btn-primary btn-sm" onclick="cambiarRolUsuario(${u.id})">Guardar</button>
            </div>
          </td>
        </tr>
      `,
      )
      .join("");
  } catch (error) {
    console.error("Error cargando usuarios:", error);
  }
}

window.cambiarRolUsuario = async function (usuarioId) {
  const token = localStorage.getItem("token");
  const nuevoRol = document.getElementById(`selectRol_${usuarioId}`).value;

  try {
    const res = await fetch(`${API_URL}/auth/usuarios/${usuarioId}/rol`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rol: nuevoRol }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      mostrarAlerta(data.mensaje, "success");
      cargarUsuariosAdmin();
    } else {
      mostrarAlerta(data.mensaje || "No se pudo actualizar el rol.");
    }
  } catch (error) {
    mostrarAlerta("Error al cambiar el rol.");
  }
};
