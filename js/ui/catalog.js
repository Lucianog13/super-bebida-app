// Vista de catálogo: render de productos (con foto), búsqueda y filtros.
// Solo toca el DOM; la lógica pura vive en js/core/.
// init() es idempotente: se puede llamar de nuevo con otros productos
// (refresh()) sin duplicar listeners.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CatalogUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const LABELS = {
    gaseosas: "Gaseosas",
    aguas: "Aguas",
    cervezas: "Cervezas",
    vinos: "Vinos",
    jugos: "Jugos",
    almacen: "Almacén",
    golosinas: "Golosinas",
    aperitivos: "Aperitivos",
    limpieza: "Limpieza",
    espumantes: "Espumantes",
    snacks: "Snacks",
    galletitas: "Galletitas",
    farmacia: "Farmacia",
    kiosco: "Kiosco",
    mascotas: "Mascotas",
  };

  const ICONO_PLUS =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  const state = { query: "", categoria: "todas" };
  let opts = null;
  let bound = false;

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function filtrar(productos, query, categoria) {
    const q = normalize(query).trim();
    return productos.filter((p) => {
      if (categoria && categoria !== "todas" && p.categoria !== categoria) return false;
      if (!q) return true;
      return normalize(p.nombre + " " + (p.marca || "")).includes(q);
    });
  }

  function cardHTML(p) {
    const foto = p.imagen
      ? `<div class="foto"><img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.remove();this.parentElement.querySelector('.emoji-fallback').hidden=false"><span class="emoji-fallback" hidden>${p.emoji || "📦"}</span></div>`
      : `<div class="foto"><span class="emoji-fallback">${p.emoji || "📦"}</span></div>`;
    const promo = p.enPromo
      ? `<span class="badge-promo">Promo</span>
         <div class="precio-anterior">${Order.formatMoney(p.precioAnterior)}</div>`
      : "";
    const desc = p.descripcion ? `<div class="descripcion">${p.descripcion}</div>` : "";
    return `
      <article class="card" data-id="${p.id}">
        ${foto}
        <div class="card-cuerpo">
          <div class="nombre">${p.nombre}</div>
          <div class="detalle">${p.presentacion} · ${p.unidad}</div>
          ${desc}
          ${promo}
          <div class="precio">${Order.formatMoney(p.precio)}</div>
          <button class="btn-agregar" data-accion="agregar">${ICONO_PLUS} Agregar</button>
        </div>
      </article>`;
  }

  function categoriasDisponibles() {
    return ["todas"].concat([...new Set(opts.productos.map((p) => p.categoria))]);
  }

  function renderChips() {
    opts.chips.innerHTML = categoriasDisponibles()
      .map(
        (c) =>
          `<button class="chip ${state.categoria === c ? "active" : ""}" data-categoria="${c}">${
            c === "todas" ? "Todos" : LABELS[c] || c
          }</button>`
      )
      .join("");
  }

  function render() {
    const lista = filtrar(opts.productos, state.query, state.categoria);
    opts.grid.innerHTML = lista.length
      ? lista.map(cardHTML).join("")
      : '<p class="carrito-vacio">No hay productos que coincidan con la búsqueda.</p>';
    if (opts.resultados) {
      opts.resultados.textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;
    }
  }

  function bind() {
    opts.searchInput.addEventListener("input", () => {
      state.query = opts.searchInput.value;
      render();
    });
    opts.chips.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-categoria]");
      if (!btn) return;
      state.categoria = btn.dataset.categoria;
      renderChips();
      render();
    });
    opts.grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-accion='agregar']");
      if (!btn) return;
      const card = btn.closest("[data-id]");
      const producto = opts.productos.find((p) => p.id === card.dataset.id);
      if (producto) opts.onAdd(producto);
    });
  }

  function init(o) {
    opts = o;
    if (!bound) {
      bind();
      bound = true;
    }
    renderChips();
    render();
  }

  function refresh(nuevosProductos) {
    if (!opts) return;
    opts.productos = nuevosProductos;
    renderChips();
    render();
  }

  return { init, refresh, filtrar, normalize };
});
