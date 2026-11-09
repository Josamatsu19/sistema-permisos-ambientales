const API_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (token) {
    window.location.href = "dashboard.html";
    return;
  }

  const formLogin = document.getElementById("formLogin");
  const alerta = document.getElementById("alertaLogin");

  function mostrarAlerta(mensaje, tipo = "error") {
    alerta.textContent = mensaje;
    alerta.className = `alert ${tipo === "success" ? "alert-success" : "alert-error"}`;
    alerta.style.display = "block";
  }

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    alerta.style.display = "none";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        mostrarAlerta(data.mensaje || "Error al iniciar sesión.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      window.location.href = "dashboard.html";
    } catch (error) {
      mostrarAlerta("Error de conexión con el servidor.");
    }
  });
});
