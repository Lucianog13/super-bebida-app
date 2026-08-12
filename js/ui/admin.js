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

  const API = () => window.APP_CONFIG;

  async function cargar() {
    const cfg = API();
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?select=*&order=nombre.asc`,
      { headers: { apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey } }
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
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(pid)}`,
      {
        method: "PATCH",
        headers: {
          apikey: cfg.supabaseKey,
          Authorization: "Bearer " + cfg.supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ precio, en_promo: enPromo, precio_anterior: precioAnterior }),
      }
    );
    if (!res.ok) {
      toastFn("Error al guardar (HTTP " + res.status + ")");
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
    const nombre = pid + "-" + Date.now() + "." + ext;
    toastFn("Subiendo foto…");
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/fotos/${nombre}`, {
        method: "POST",
        headers: {
          apikey: cfg.supabaseKey,
          Authorization: "Bearer " + cfg.supabaseKey,
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
        headers: {
          apikey: cfg.supabaseKey,
          Authorization: "Bearer " + cfg.supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
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

  function init(o) {
    listaEl = o.lista;
    toastFn = o.toast || toastFn;
    o.busqueda.addEventListener("input", (e) => render(e.target.value));
    listaEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-accion]");
      if (!btn) return;
      const fila = btn.closest(".fila-admin");
      const pid = fila.dataset.id;
      if (btn.dataset.accion === "guardar") guardar(pid);
      if (btn.dataset.accion === "foto") fila.querySelector(".in-foto").click();
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
