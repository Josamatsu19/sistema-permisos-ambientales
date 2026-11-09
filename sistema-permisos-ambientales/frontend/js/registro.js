const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const formRegistro = document.getElementById("formRegistro");
  const alerta = document.getElementById("alertaRegistro");

  function mostrarAlerta(mensaje, tipo = "error") {
    alerta.textContent = mensaje;
    alerta.className = `alert ${tipo === "success" ? "alert-success" : "alert-error"}`;
    alerta.style.display = "block";
  }

  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    alerta.style.display = "none";

    const nombre = document.getElementById("nombre").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const rol = document.getElementById("rol").value;

    try {
      const response = await fetch(`${API_URL}/auth/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, password, rol }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        mostrarAlerta(data.mensaje || "No se pudo completar el registro.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      mostrarAlerta("Registro exitoso. Redirigiendo al panel...", "success");

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 900);
    } catch (error) {
      mostrarAlerta("Error de conexión al intentar registrar el usuario.");
    }
  });
});
