// Gestión de clientes en el admin: listar/buscar, agregar, editar y eliminar.
// Guarda en Supabase (tabla `clientes`) con token de admin. Lectura pública.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ClientesUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  let clientes = [];
  let listaEl = null;
  let toastFn = () => {};
  let filtro = "";
  let editandoCodigo = null;

  const API = () => window.APP_CONFIG;

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function headersAuth(conJson) {
    const cfg = API();
    const h = { apikey: cfg.supabaseKey };
    const t = await window.Auth.token();
    if (t) h.Authorization = "Bearer " + t;
    if (conJson) h["Content-Type"] = "application/json";
    return h;
  }

  async function cargar() {
    const cfg = API();
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/clientes?select=*&order=codigo.asc`,
      { headers: { apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey } }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    clientes = await res.json();
  }

  function filaHTML(c) {
    const direccion = [
      c.direccion || "",
      c.numero_domicilio ? "N° " + c.numero_domicilio : "",
    ].filter(Boolean).join(" ");
    return `
    <div class="fila-admin fila-cliente" data-codigo="${esc(c.codigo)}">
      <div class="info">
        <div class="nombre">${esc(c.nombre)} <span class="cliente-nro">N° ${esc(c.codigo)}</span></div>
        <div class="detalle">${esc(direccion)}${c.localidad ? " · " + esc(c.localidad) : ""}</div>
        ${c.telefono ? `<div class="detalle">📞 ${esc(c.telefono)}</div>` : ""}
      </div>
      <div class="acciones">
        <button class="btn small outline" data-accion="editar">✏️ Editar</button>
        <button class="btn small danger" data-accion="eliminar">🗑 Eliminar</button>
      </div>
    </div>`;
  }

  function render(q) {
    filtro = q || "";
    const f = filtro.toLowerCase();
    const lista = f
      ? clientes.filter((c) =>
          (c.nombre + " " + c.codigo + " " + (c.direccion || "") + " " + (c.telefono || ""))
            .toLowerCase()
            .includes(f)
        )
      : clientes;
    listaEl.innerHTML = lista.length
      ? lista.map(filaHTML).join("")
      : '<p class="carrito-vacio">Sin resultados.</p>';
  }

  async function crearCliente(e) {
    e.preventDefault();
    const get = (id) => document.getElementById(id).value.trim();
    const codigo = get("nuevo-cliente-codigo");
    const nombre = get("nuevo-cliente-nombre");
    const direccion = get("nuevo-cliente-direccion");
    const numeroDomicilio = get("nuevo-cliente-numero");
    const telefono = get("nuevo-cliente-telefono");
    if (!codigo || !nombre) {
      toastFn("Completá número y nombre (mínimo)", "error");
      return;
    }
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const res = await fetch(`${API().supabaseUrl}/rest/v1/clientes`, {
      method: "POST",
      headers: { ...h, Prefer: "return=minimal" },
      body: JSON.stringify({
        codigo,
        nombre,
        nombre_norm: norm(nombre),
        direccion,
        direccion_norm: norm(direccion),
        numero_domicilio: numeroDomicilio,
        telefono,
      }),
    });
    if (!res.ok) {
      toastFn(
        res.status === 409
          ? "Ya existe un cliente con ese número"
          : "Error al guardar (HTTP " + res.status + ")",
        "error"
      );
      return;
    }
    document.getElementById("form-cliente-nuevo").hidden = true;
    document.getElementById("form-cliente-nuevo").reset();
    toastFn("Cliente agregado ✔ — ya aparece en el autocompletar del checkout");
    await cargar();
    render(filtro);
  }

  async function eliminarCliente(codigo) {
    const c = clientes.find((x) => x.codigo === codigo);
    if (!c) return;
    if (!window.confirm(`¿Eliminar a "${c.nombre}" (N° ${codigo})? No se puede deshacer.`)) return;
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const res = await fetch(
      `${API().supabaseUrl}/rest/v1/clientes?codigo=eq.${encodeURIComponent(codigo)}`,
      { method: "DELETE", headers: { ...h, Prefer: "return=minimal" } }
    );
    if (!res.ok) {
      toastFn("Error al eliminar (HTTP " + res.status + ")", "error");
      return;
    }
    clientes = clientes.filter((x) => x.codigo !== codigo);
    render(filtro);
    toastFn("Cliente eliminado ✔");
  }

  function abrirEditar(codigo) {
    const c = clientes.find((x) => x.codigo === codigo);
    if (!c) return;
    editandoCodigo = codigo;
    document.getElementById("editar-cliente-codigo").textContent = c.codigo;
    document.getElementById("editar-cliente-nombre").value = c.nombre || "";
    document.getElementById("editar-cliente-direccion").value = c.direccion || "";
    document.getElementById("editar-cliente-numero").value = c.numero_domicilio || "";
    document.getElementById("editar-cliente-telefono").value = c.telefono || "";
    document.getElementById("modal-editar-cliente").hidden = false;
    document.getElementById("editar-cliente-nombre").focus();
  }

  function cerrarEditar() {
    editandoCodigo = null;
    document.getElementById("modal-editar-cliente").hidden = true;
  }

  async function guardarEdicion() {
    if (!editandoCodigo) return;
    const get = (id) => document.getElementById(id).value.trim();
    const nombre = get("editar-cliente-nombre");
    const direccion = get("editar-cliente-direccion");
    const numeroDomicilio = get("editar-cliente-numero");
    const telefono = get("editar-cliente-telefono");
    if (!nombre) {
      toastFn("El nombre no puede quedar vacío", "error");
      return;
    }
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar", "error");
      return;
    }
    const res = await fetch(
      `${API().supabaseUrl}/rest/v1/clientes?codigo=eq.${encodeURIComponent(editandoCodigo)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({
          nombre,
          nombre_norm: norm(nombre),
          direccion,
          direccion_norm: norm(direccion),
          numero_domicilio: numeroDomicilio,
          telefono,
        }),
      }
    );
    if (!res.ok) {
      toastFn("Error al guardar (HTTP " + res.status + ")", "error");
      return;
    }
    cerrarEditar();
    await cargar();
    render(filtro);
    toastFn("Cliente actualizado ✔");
  }

  function init(o) {
    listaEl = o.lista;
    toastFn = o.toast || toastFn;
    o.busqueda.addEventListener("input", (e) => render(e.target.value));

    const formNuevo = document.getElementById("form-cliente-nuevo");
    document.getElementById("btn-cliente-nuevo").addEventListener("click", () => {
      formNuevo.hidden = !formNuevo.hidden;
      if (!formNuevo.hidden) formNuevo.querySelector("input").focus();
    });
    document.getElementById("btn-cliente-nuevo-cancelar").addEventListener("click", () => {
      formNuevo.hidden = true;
      formNuevo.reset();
    });
    formNuevo.addEventListener("submit", crearCliente);

    document.getElementById("btn-editar-cliente-guardar").addEventListener("click", guardarEdicion);
    document.getElementById("btn-editar-cliente-cancelar").addEventListener("click", cerrarEditar);
    const modalEditar = document.getElementById("modal-editar-cliente");
    modalEditar.addEventListener("click", (e) => {
      if (e.target === modalEditar) cerrarEditar();
    });

    listaEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-accion]");
      if (!btn) return;
      const codigo = btn.closest(".fila-cliente").dataset.codigo;
      if (btn.dataset.accion === "editar") abrirEditar(codigo);
      if (btn.dataset.accion === "eliminar") eliminarCliente(codigo);
    });
  }

  return { init, cargar, render };
});
