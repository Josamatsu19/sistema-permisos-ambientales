const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  document
    .getElementById("btnSimularClasificacion")
    .addEventListener("click", simularClasificacion);
  document
    .getElementById("formCrearSolicitud")
    .addEventListener("submit", guardarSolicitud);
});

function obtenerDatosCuestionario() {
  return {
    extension_hectareas:
      parseFloat(document.getElementById("extension_hectareas").value) || 0,
    afectacion_hidrica: document.getElementById("afectacion_hidrica").value,
    afectacion_forestal: document.getElementById("afectacion_forestal").value,
    nivel_emisiones: document.getElementById("nivel_emisiones").value,
    cercania_areas_protegidas: document.getElementById(
      "cercania_areas_protegidas",
    ).value,
    riesgo_social: document.getElementById("riesgo_social").value,
    manejo_residuos_peligrosos: document.getElementById(
      "manejo_residuos_peligrosos",
    ).checked,
  };
}

async function simularClasificacion() {
  const token = localStorage.getItem("token");
  const cuestionario = obtenerDatosCuestionario();

  try {
    const res = await fetch(`${API_URL}/clasificacion/simular`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cuestionario),
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      const sim = data.simulacion;
      const caja = document.getElementById("cajaResultadoSimulacion");
      const badge = document.getElementById("simCategoriaBadge");

      badge.textContent = sim.categoria_resultante;
      badge.className =
        sim.categoria_resultante === "Categoría I"
          ? "badge cat-I"
          : sim.categoria_resultante === "Categoría II"
            ? "badge cat-II"
            : "badge cat-III";

      document.getElementById("simPuntajeTexto").textContent =
        `Puntaje de Impacto: ${sim.puntaje_total} pts`;
      document.getElementById("simJustificacionTexto").textContent =
        sim.justificacion_tecnica;
      caja.style.display = "block";
    }
  } catch (error) {
    console.error("Error al simular:", error);
  }
}

async function guardarSolicitud(e) {
  e.preventDefault();
  const token = localStorage.getItem("token");
  const alerta = document.getElementById("alertaCrear");

  const payload = {
    nombre_proyecto: document.getElementById("nombre_proyecto").value.trim(),
    sector: document.getElementById("sector").value,
    ubicacion: document.getElementById("ubicacion").value.trim(),
    tipo_permiso: document.getElementById("tipo_permiso").value,
    descripcion: document.getElementById("descripcion").value.trim(),
    cuestionario_ambiental: obtenerDatosCuestionario(),
  };

  try {
    const res = await fetch(`${API_URL}/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      alerta.textContent = data.mensaje || "Error al registrar la solicitud.";
      alerta.className = "alert alert-error";
      alerta.style.display = "block";
      return;
    }

    alerta.textContent = `Solicitud #${data.solicitud.id} creada con éxito (${data.solicitud.categoria_ambiental}). Redirigiendo al expediente...`;
    alerta.className = "alert alert-success";
    alerta.style.display = "block";

    setTimeout(() => {
      window.location.href = `editar-solicitud.html?id=${data.solicitud.id}`;
    }, 1000);
  } catch (error) {
    alerta.textContent = "Error de conexión con el servidor.";
    alerta.className = "alert alert-error";
    alerta.style.display = "block";
  }
}
