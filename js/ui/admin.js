// Panel de administración: editar precios/promos y subir fotos desde la app.
// Los cambios se guardan en Supabase (los ven todos los dispositivos).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AdminUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  let productos = [];
  let listaEl = null;
  let toastFn = () => {};
  let filtro = "";
  let editandoPid = null;

  const API = () => window.APP_CONFIG;

  async function cargar() {
    const cfg = API();
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?select=*&order=nombre.asc`,
      { headers: await headersAuth(false) }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    productos = await res.json();
  }

  function filaHTML(p) {
    const foto = p.imagen
      ? `<img class="thumb" src="${p.imagen}" alt="" onerror="this.remove()">`
      : `<span class="thumb">${p.emoji || "📦"}</span>`;
    return `
    <div class="fila-admin" data-id="${p.id}">
      ${foto}
      <div class="info">
        <div class="nombre">${p.nombre}</div>
        <div class="detalle">${p.marca ? p.marca + " · " : ""}${p.presentacion ? p.presentacion + " · " : ""}${p.unidad}</div>
      </div>
      <div class="campos">
        <label class="campo">Precio $<input type="number" class="in-precio" value="${p.precio}" min="0" step="100"></label>
        <label class="campo promo-row"><input type="checkbox" class="in-promo" ${p.en_promo ? "checked" : ""}> Promo</label>
        <label class="campo">Anterior $<input type="number" class="in-anterior" value="${p.precio_anterior || ""}" min="0" step="100"></label>
      </div>
      <div class="acciones">
        <button class="btn small primary" data-accion="guardar">Guardar</button>
        <button class="btn small secondary" data-accion="foto">Cambiar foto</button>
        <button class="btn small outline" data-accion="editar">✏️ Editar</button>
        <input type="file" class="in-foto" accept="image/png,image/jpeg,image/webp" hidden>
      </div>
    </div>`;
  }

  function render(q) {
    filtro = q || "";
    const f = filtro.toLowerCase();
    const lista = f
      ? productos.filter((p) => (p.nombre + " " + (p.marca || "")).toLowerCase().includes(f))
      : productos;
    listaEl.innerHTML = lista.length
      ? lista.map(filaHTML).join("")
      : '<p class="carrito-vacio">Sin resultados.</p>';
  }

  async function guardar(pid) {
    const p = productos.find((x) => x.id === pid);
    const fila = listaEl.querySelector(`[data-id="${CSS.escape(pid)}"]`);
    if (!p || !fila) return;
    const precio = parseInt(fila.querySelector(".in-precio").value, 10);
    const enPromo = fila.querySelector(".in-promo").checked;
    const anteriorRaw = fila.querySelector(".in-anterior").value.trim();
    const precioAnterior = enPromo && anteriorRaw ? parseInt(anteriorRaw, 10) : null;
    if (!Number.isFinite(precio) || precio <= 0) {
      toastFn("Precio inválido");
      return;
    }
    const cfg = API();
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar");
      return;
    }
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(pid)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ precio, en_promo: enPromo, precio_anterior: precioAnterior }),
      }
    );
    if (!res.ok) {
      toastFn(
        res.status === 401 || res.status === 403
          ? "No autorizado — cerrá sesión y volvé a entrar"
          : "Error al guardar (HTTP " + res.status + ")"
      );
      return;
    }
    p.precio = precio;
    p.en_promo = enPromo;
    p.precio_anterior = precioAnterior;
    toastFn("Guardado ✔ — visible para todos los dispositivos");
  }

  async function cambiarFoto(pid, file) {
    const p = productos.find((x) => x.id === pid);
    if (!p || !file) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
      toastFn("Formato no soportado (usá PNG, JPG o WEBP)");
      return;
    }
    const cfg = API();
    const h = await headersAuth(false);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar");
      return;
    }
    const nombre = pid + "-" + Date.now() + "." + ext;
    toastFn("Subiendo foto…");
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/fotos/${nombre}`, {
        method: "POST",
        headers: {
          ...h,
          "Content-Type": file.type || "image/" + ext,
          "x-upsert": "true",
        },
        body: file,
      });
    } catch {
      toastFn("Error de red al subir la foto");
      return;
    }
    if (!res.ok) {
      toastFn("Error al subir la foto (HTTP " + res.status + ")");
      return;
    }
    const url = `${cfg.supabaseUrl}/storage/v1/object/public/fotos/${nombre}`;
    const res2 = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(pid)}`,
      {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ imagen: url }),
      }
    );
    if (!res2.ok) {
      toastFn("Foto subida, pero no se pudo asociar al producto");
      return;
    }
    p.imagen = url;
    toastFn("Foto actualizada ✔");
    render(filtro);
  }

  function abrirEditar(pid) {
    const p = productos.find((x) => x.id === pid);
    if (!p) return;
    editandoPid = pid;
    document.getElementById("editar-producto-actual").textContent = p.nombre;
    document.getElementById("editar-nombre").value = p.nombre;
    document.getElementById("editar-descripcion").value = p.descripcion || "";
    document.getElementById("modal-editar").hidden = false;
    document.getElementById("editar-nombre").focus();
  }

  function cerrarEditar() {
    editandoPid = null;
    document.getElementById("modal-editar").hidden = true;
  }

  async function guardarEdicion() {
    if (!editandoPid) return;
    const nombre = document.getElementById("editar-nombre").value.trim();
    const descripcion = document.getElementById("editar-descripcion").value.trim();
    if (!nombre) {
      toastFn("El nombre no puede quedar vacío");
      return;
    }
    const cfg = API();
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar");
      return;
    }
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(editandoPid)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ nombre, descripcion }),
      }
    );
    if (!res.ok) {
      toastFn(
        res.status === 401 || res.status === 403
          ? "No autorizado — cerrá sesión y volvé a entrar"
          : "Error al guardar (HTTP " + res.status + ")"
      );
      return;
    }
    const p = productos.find((x) => x.id === editandoPid);
    if (p) { p.nombre = nombre; p.descripcion = descripcion; }
    cerrarEditar();
    render(filtro);
    toastFn("Guardado ✔ — visible para todos los dispositivos");
  }

  async function headersAuth(conJson) {
    const h = { apikey: API().supabaseKey };
    const t = await window.Auth.token();
    if (t) h.Authorization = "Bearer " + t;
    if (conJson) h["Content-Type"] = "application/json";
    return h;
  }

  async function crearProducto(e) {
    e.preventDefault();
    const form = document.getElementById("form-admin-nuevo");
    const get = (id) => document.getElementById(id).value.trim();
    const nombre = get("nuevo-nombre");
    const marca = get("nuevo-marca");
    const categoria = get("nuevo-categoria");
    const presentacion = get("nuevo-presentacion");
    const unidad = get("nuevo-unidad") || "unidad";
    const precio = parseInt(get("nuevo-precio"), 10);
    const fotoInput = document.getElementById("nuevo-foto");
    if (!nombre || !Number.isFinite(precio) || precio <= 0) {
      toastFn("Completá nombre y precio");
      return;
    }
    const cfg = API();
    const h = await headersAuth(true);
    if (!h.Authorization) {
      toastFn("Sesión vencida — cerrá sesión y volvé a entrar");
      return;
    }
    // id único: slug del nombre + timestamp corto
    const slug = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "producto";
    const id = slug + "-" + Date.now().toString(36);

    let imagen = "";
    if (fotoInput.files && fotoInput.files[0]) {
      const file = fotoInput.files[0];
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
        toastFn("Formato de foto no soportado (PNG, JPG o WEBP)");
        return;
      }
      toastFn("Subiendo foto…");
      const fotoNombre = id + "." + ext;
      let res;
      try {
        res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/fotos/${fotoNombre}`, {
          method: "POST",
          headers: { ...h, "Content-Type": file.type || "image/" + ext, "x-upsert": "true" },
          body: file,
        });
      } catch {
        toastFn("Error de red al subir la foto");
        return;
      }
      if (!res.ok) {
        toastFn("Error al subir la foto (HTTP " + res.status + ")");
        return;
      }
      imagen = `${cfg.supabaseUrl}/storage/v1/object/public/fotos/${fotoNombre}`;
    }

    const payload = {
      id, nombre, marca, categoria, presentacion,
      unidad, precio, en_promo: false, precio_anterior: null,
      retornable: false, emoji: "", imagen, descripcion: "",
    };
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/productos`, {
      method: "POST",
      headers: { ...h, Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toastFn(
        res.status === 401 || res.status === 403
          ? "No autorizado — cerrá sesión y volvé a entrar"
          : "Error al crear (HTTP " + res.status + ")"
      );
      return;
    }
    form.reset();
    form.hidden = true;
    toastFn("Producto creado ✔ — visible para todos los dispositivos");
    await cargar();
    render(filtro);
  }

  function init(o) {
    listaEl = o.lista;
    toastFn = o.toast || toastFn;
    document.getElementById("btn-editar-cancelar").addEventListener("click", cerrarEditar);
    document.getElementById("btn-editar-guardar").addEventListener("click", guardarEdicion);
    const modalEditar = document.getElementById("modal-editar");
    modalEditar.addEventListener("click", (e) => {
      if (e.target === modalEditar) cerrarEditar();
    });
    o.busqueda.addEventListener("input", (e) => render(e.target.value));
    // Formulario de producto nuevo
    const formNuevo = document.getElementById("form-admin-nuevo");
    document.getElementById("btn-admin-nuevo").addEventListener("click", () => {
      formNuevo.hidden = !formNuevo.hidden;
      if (!formNuevo.hidden) formNuevo.querySelector("input").focus();
    });
    document.getElementById("btn-admin-nuevo-cancelar").addEventListener("click", () => {
      formNuevo.hidden = true;
      formNuevo.reset();
    });
    formNuevo.addEventListener("submit", crearProducto);
    listaEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-accion]");
      if (!btn) return;
      const fila = btn.closest(".fila-admin");
      const pid = fila.dataset.id;
      if (btn.dataset.accion === "guardar") guardar(pid);
      if (btn.dataset.accion === "foto") fila.querySelector(".in-foto").click();
      if (btn.dataset.accion === "editar") abrirEditar(pid);
    });
    listaEl.addEventListener("change", (e) => {
      if (!e.target.classList.contains("in-foto")) return;
      const fila = e.target.closest(".fila-admin");
      if (e.target.files && e.target.files[0]) cambiarFoto(fila.dataset.id, e.target.files[0]);
      e.target.value = "";
    });
  }

  return { init, cargar, render };
});
