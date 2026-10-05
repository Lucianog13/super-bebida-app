// Registro único del cliente ("login" de datos): Nº de cliente + nombre + apellido + dirección.
// Verifica el Nº contra la tabla `clientes` de Supabase:
//   - existe        → badge verde + autocompleta la dirección.
//   - no existe     → BLOQUEA el guardado y ofrece "avisar por WhatsApp" (cliente nuevo).
//   - sin conexión / servicio caído → permite seguir con aviso (no bloquea a un cliente real).
// Guarda con Storage.saveCliente (clave "cliente") y avisa con onGuardado.
// Solo toca el DOM; la validación pura vive en js/core/cliente.js.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.LoginUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  // WhatsApp de la empresa: mismo número fijo al que sale cada pedido.
  const TEL_EMPRESA = "343 518-2883";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function init(opts) {
    const {
      modal, form,
      nroInput, nombreInput, apellidoInput, direccionInput,
      verificadoBox, errorBox, btnWa, btnGuardar, btnCancelar,
      supabaseUrl, supabaseKey,
      loadCliente, saveCliente, onGuardado,
    } = opts;

    const Cliente = window.Cliente;
    let codigoVerificado = "";      // último Nº confirmado contra la lista
    let estadoGuardado = "libre";    // "libre" | "verificando" | "listo" | "bloqueado"
    let modoEdicion = false;

    function nroActual() {
      return nroInput.value.replace(/\D/g, "");
    }

    function limpiarMensajes() {
      verificadoBox.hidden = true;
      errorBox.hidden = true;
      errorBox.className = "reg-error";
      btnWa.hidden = true;
      btnGuardar.disabled = false;
    }

    function pintarCamposConError(errores) {
      [nroInput, nombreInput, apellidoInput, direccionInput]
        .forEach((i) => i.classList.remove("campo-error"));
      const mapa = {
        nro: nroInput,
        nombre: nombreInput,
        apellido: apellidoInput,
        direccion: direccionInput,
      };
      Object.keys(errores).forEach((k) => {
        if (mapa[k]) mapa[k].classList.add("campo-error");
      });
    }

    function mostrarErrores(errores) {
      errorBox.textContent = Object.values(errores).join(" ");
      errorBox.hidden = false;
      pintarCamposConError(errores);
      btnGuardar.disabled = false;
    }

    function pintarNoEncontrado() {
      const nombreTxt = [nombreInput.value.trim(), apellidoInput.value.trim()]
        .filter(Boolean).join(" ");
      const texto =
        "Hola! Soy cliente nuevo y quiero registrarme en la app de pedidos de El Super de la Bebida." +
        (nombreTxt ? "\nNombre: " + nombreTxt : "") +
        (direccionInput.value.trim() ? "\nDirección: " + direccionInput.value.trim() : "") +
        "\nNº de cliente que intenté: " + nroActual();
      errorBox.textContent =
        "Ese número no figura en el listado de clientes. Revisalo bien; si sos cliente nuevo, " +
        "avisá por WhatsApp y te damos de alta.";
      errorBox.hidden = false;
      btnWa.href = Cliente.waLink(TEL_EMPRESA, texto);
      btnWa.hidden = false;
      btnGuardar.disabled = true;
      estadoGuardado = "bloqueado";
    }

    function pintarSinVerificacion(sinConexion) {
      errorBox.className = "reg-error aviso";
      errorBox.textContent = sinConexion
        ? "Sin conexión: no pudimos verificar tu número. Podés continuar igual y se guardará tal como lo escribiste."
        : "El servicio de datos está caído: no pudimos verificar tu número. Podés continuar igual y se guardará tal como lo escribiste.";
      errorBox.hidden = false;
      btnGuardar.disabled = false;
      estadoGuardado = "listo";
    }

    function pintarVerificado(c) {
      const cod = nroActual();
      verificadoBox.innerHTML =
        "✔ Nº verificado: <strong>" + esc(c.nombre || "") + "</strong>" +
        (c.direccion ? " · " + esc(c.direccion) : "");
      verificadoBox.hidden = false;
      if (c.direccion && !direccionInput.value.trim()) {
        direccionInput.value = c.direccion;
      }
      codigoVerificado = cod;
      estadoGuardado = "listo";
    }

    async function verificar(cod) {
      if (!supabaseUrl) {
        pintarSinVerificacion(false);
        return;
      }
      limpiarMensajes();
      estadoGuardado = "verificando";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/clientes?select=codigo,nombre,direccion&codigo=eq.${encodeURIComponent(cod)}`,
          { headers: { apikey: supabaseKey, Authorization: "Bearer " + supabaseKey }, signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (!res.ok) {
          pintarSinVerificacion(false);
          return;
        }
        const data = await res.json();
        const lista = Array.isArray(data) ? data : [];
        if (lista.length) pintarVerificado(lista[0]);
        else pintarNoEncontrado();
      } catch (e) {
        clearTimeout(timer);
        pintarSinVerificacion(true);
      }
    }

    // Abre el modal. { editar: true } = modo "Editar mis datos" (pre-rellena lo guardado).
    // El botón Cancelar solo aparece en modo edición (el registro inicial es estricto).
    function mostrar(opciones) {
      modoEdicion = !!(opciones && opciones.editar);
      limpiarMensajes();
      codigoVerificado = "";
      form.reset();
      btnCancelar.hidden = !modoEdicion;
      const prev = loadCliente();
      if (modoEdicion && prev) {
        // Registro actual: nombre/apellido separados. Legado: nombre ya combinado.
        const separados = prev.apellido != null && prev.apellido !== "";
        nroInput.value = prev.nroCliente || "";
        nombreInput.value = prev.nombre || "";
        apellidoInput.value = separados ? prev.apellido || "" : "";
        direccionInput.value = prev.direccion || "";
      }
      modal.hidden = false;
      nroInput.focus();
    }

    function guardar() {
      const r = Cliente.validar({
        nroCliente: nroInput.value,
        nombre: nombreInput.value,
        apellido: apellidoInput.value,
        direccion: direccionInput.value,
      });
      if (!r.ok) {
        mostrarErrores(r.errores);
        return;
      }
      saveCliente(r.cliente);
      modal.hidden = true;
      if (onGuardado) onGuardado(r.cliente, modoEdicion);
    }

    // Al salir del campo Nº, verifica contra la lista (si el valor cambió).
    nroInput.addEventListener("blur", () => {
      const cod = nroActual();
      if (cod && cod !== codigoVerificado) {
        codigoVerificado = "";
        verificar(cod);
      }
    });

    // Si edita el Nº, la verificación anterior queda inválida.
    nroInput.addEventListener("input", () => {
      if (codigoVerificado && nroActual() !== codigoVerificado) {
        codigoVerificado = "";
        limpiarMensajes();
      }
    });

    // Cancelar: solo existe en modo edición (el registro inicial es estricto, sin salida).
    btnCancelar.addEventListener("click", () => {
      modal.hidden = true;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (estadoGuardado === "verificando") return;
      const r = Cliente.validar({
        nroCliente: nroInput.value,
        nombre: nombreInput.value,
        apellido: apellidoInput.value,
        direccion: direccionInput.value,
      });
      if (!r.ok) {
        mostrarErrores(r.errores);
        return;
      }
      // Asegura la verificación (primera vez, o Nº cambiado desde el blur).
      if (codigoVerificado !== nroActual()) {
        await verificar(nroActual());
      }
      if (estadoGuardado === "bloqueado") return;
      guardar();
    });

    return { mostrar };
  }

  return { init };
});
