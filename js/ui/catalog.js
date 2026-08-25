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
  let tiltPromos = null; // efecto 3D del carrusel (se define en bind)

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function filtrar(productos, query, categoria) {
    const q = normalize(query).trim();
    return productos.filter((p) => {
      if (categoria === "promociones") {
        if (!(p.enPromo && p.activo !== false)) return false;
      } else if (categoria && categoria !== "todas" && p.categoria !== categoria) {
        return false;
      }
      if (!q) return true;
      return normalize(p.nombre + " " + (p.marca || "")).includes(q);
    });
  }

  // Solo se muestra la unidad cuando aporta info (pack x10, cajón x1…).
  // "unidad" a secas es redundante y no se renderiza.
  function unidadTexto(p) {
    return p.unidad && p.unidad !== "unidad" ? p.unidad : "";
  }

  function cardHTML(p) {
    const sinStock = p.activo === false;
    const foto = p.imagen
      ? `<div class="foto"><img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.remove();this.parentElement.querySelector('.emoji-fallback').hidden=false"><span class="emoji-fallback" hidden>${p.emoji || "📦"}</span></div>`
      : `<div class="foto"><span class="emoji-fallback">${p.emoji || "📦"}</span></div>`;
    const promo = p.enPromo
      ? `<span class="badge-promo">Promo</span>
         <div class="precio-anterior">${Order.formatMoney(p.precioAnterior)}</div>`
      : "";
    const desc = p.descripcion ? `<div class="descripcion">${p.descripcion}</div>` : "";
    const unidad = unidadTexto(p) ? `<div class="detalle">${unidadTexto(p)}</div>` : "";
    const sinStockBadge = sinStock ? `<span class="badge-sin-stock">Sin stock</span>` : "";
    const tieneSabores = Array.isArray(p.sabores) && p.sabores.length > 0;
    const boton = sinStock
      ? `<button class="btn-agregar" disabled>Sin stock</button>`
      : tieneSabores
      ? `<button class="btn-agregar" data-accion="abrir-sabores">${ICONO_PLUS} Elegir sabores</button>`
      : `<button class="btn-agregar" data-accion="agregar">${ICONO_PLUS} Agregar</button>`;
    return `
      <article class="card${sinStock ? " sin-stock" : ""}" data-id="${p.id}">
        ${foto}
        <div class="card-cuerpo">
          <div class="nombre">${p.nombre}</div>
          ${unidad}
          ${desc}
          ${promo}
          ${sinStockBadge}
          <div class="precio">${Order.formatMoney(p.precio)}</div>
          ${boton}
        </div>
      </article>`;
  }

  function descuentoPromo(precio, precioAnterior) {
    if (!precioAnterior || !precio || precioAnterior <= precio) return null;
    return Math.max(1, Math.round((1 - precio / precioAnterior) * 100));
  }

  function promoCardHTML(p) {
    const ahorro = descuentoPromo(p.precio, p.precioAnterior);
    const foto = p.imagen
      ? `<div class="promo-foto"><img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.remove();this.parentElement.querySelector('.emoji-fallback').hidden=false"><span class="emoji-fallback" hidden>${p.emoji || "📦"}</span></div>`
      : `<div class="promo-foto"><span class="emoji-fallback">${p.emoji || "📦"}</span></div>`;
    const anterior = p.precioAnterior
      ? `<span class="precio-anterior">${Order.formatMoney(p.precioAnterior)}</span>`
      : "";
    const tieneSabores = Array.isArray(p.sabores) && p.sabores.length > 0;
    const boton = tieneSabores
      ? `<button class="btn-agregar" data-accion="abrir-sabores">${ICONO_PLUS} Elegir sabores</button>`
      : `<button class="btn-agregar" data-accion="agregar">${ICONO_PLUS} Agregar</button>`;
    return `
      <article class="promo-card" data-id="${p.id}">
        ${foto}
        <span class="badge-promo">Promo</span>
        ${ahorro ? `<span class="promo-ahorro">−${ahorro}%</span>` : ""}
        <div class="promo-cuerpo">
          <div class="promo-nombre">${p.nombre}</div>
          <div class="promo-precios">${anterior}<span class="promo-precio">${Order.formatMoney(p.precio)}</span></div>
          ${boton}
        </div>
      </article>`;
  }

  function categoriasDisponibles() {
    return ["todas"].concat([...new Set(opts.productos.map((p) => p.categoria))], ["promociones"]);
  }

  function renderChips() {
    opts.chips.innerHTML = categoriasDisponibles()
      .map((c) => {
        const label = c === "todas" ? "Todos" : c === "promociones" ? "🔥 Ofertas" : LABELS[c] || c;
        const extra = c === "promociones" ? " chip-promo" : "";
        return `<button class="chip ${state.categoria === c ? "active" : ""}${extra}" data-categoria="${c}">${label}</button>`;
      })
      .join("");
  }

  function renderPromos() {
    if (!opts.promos || !opts.carruselPromos) return;
    const promos = opts.productos.filter((p) => p.enPromo && p.activo !== false);
    opts.promos.hidden = promos.length === 0;
    opts.carruselPromos.innerHTML = promos.map(promoCardHTML).join("");
    if (tiltPromos && typeof requestAnimationFrame !== "undefined") requestAnimationFrame(tiltPromos);
  }

  function render() {
    const lista = filtrar(opts.productos, state.query, state.categoria);
    opts.grid.innerHTML = lista.length
      ? lista.map(cardHTML).join("")
      : '<p class="carrito-vacio">No hay productos que coincidan con la búsqueda.</p>';
    if (opts.resultados) {
      opts.resultados.textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;
    }
    renderPromos();
  }

  // ── Modal selector de sabores (productos con variedades) ──
  const selSabores = { producto: null, cantidades: {} };

  function totalSeleccion() {
    return Object.values(selSabores.cantidades).reduce((s, n) => s + n, 0);
  }

  function pintarModalSabores() {
    const p = selSabores.producto;
    if (!p || !opts.modalSaboresLista) return;
    const unidad = unidadTexto(p);
    opts.modalSaboresTitulo.textContent = p.nombre;
    opts.modalSaboresSub.textContent =
      `${Order.formatMoney(p.precio)} c/u${unidad ? " · " + unidad : ""}`;
    opts.modalSaboresLista.innerHTML = p.sabores
      .map((s) => {
        const n = selSabores.cantidades[s] || 0;
        return `<div class="sabor-fila">
          <span class="sabor-nombre">${s}</span>
          <div class="sabor-controles">
            <button type="button" data-accion="sabor-menos" data-sabor="${s}" aria-label="Quitar ${s}">−</button>
            <span class="sabor-qty">${n}</span>
            <button type="button" data-accion="sabor-mas" data-sabor="${s}" aria-label="Agregar ${s}">+</button>
          </div>
        </div>`;
      })
      .join("");
    const total = totalSeleccion();
    opts.modalSaboresTotal.textContent = total;
    opts.btnConfirmarSabores.disabled = total === 0;
  }

  function abrirModalSabores(producto) {
    if (!opts.modalSabores || !producto.sabores) return;
    selSabores.producto = producto;
    selSabores.cantidades = {};
    producto.sabores.forEach((s) => {
      selSabores.cantidades[s] = opts.cantidadEnCarrito ? opts.cantidadEnCarrito(producto.id, s) : 0;
    });
    pintarModalSabores();
    opts.modalSabores.hidden = false;
  }

  function cerrarModalSabores() {
    if (!opts.modalSabores) return;
    opts.modalSabores.hidden = true;
    selSabores.producto = null;
    selSabores.cantidades = {};
  }

  function confirmarSabores() {
    const p = selSabores.producto;
    if (!p) return;
    const seleccion = Object.keys(selSabores.cantidades)
      .map((s) => ({ sabor: s, cantidad: selSabores.cantidades[s] }))
      .filter((x) => x.cantidad > 0);
    if (seleccion.length && opts.onAddSabores) opts.onAddSabores(p, seleccion);
    cerrarModalSabores();
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
      const btn = e.target.closest("button[data-accion]");
      if (!btn) return;
      const card = btn.closest("[data-id]");
      if (!card) return;
      const producto = opts.productos.find((p) => p.id === card.dataset.id);
      if (!producto) return;
      if (btn.dataset.accion === "abrir-sabores") abrirModalSabores(producto);
      else if (btn.dataset.accion === "agregar") opts.onAdd(producto);
    });

    // ── Carrusel de promos: agregar al carrito, efecto 3D y auto-avance ──
    if (opts.carruselPromos) {
      const carr = opts.carruselPromos;
      carr.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-accion]");
        if (!btn) return;
        const card = btn.closest("[data-id]");
        if (!card) return;
        const producto = opts.productos.find((p) => p.id === card.dataset.id);
        if (!producto) return;
        if (btn.dataset.accion === "abrir-sabores") abrirModalSabores(producto);
        else if (btn.dataset.accion === "agregar") opts.onAdd(producto);
      });
      const tilt = () => {
        const rect = carr.getBoundingClientRect();
        if (!rect.width) return;
        if (carr.scrollWidth <= carr.clientWidth + 1) return; // grilla fija: sin tilt
        const centro = rect.left + rect.width / 2;
        carr.querySelectorAll(".promo-card").forEach((c) => {
          const cr = c.getBoundingClientRect();
          const delta = (cr.left + cr.width / 2 - centro) / (rect.width / 2);
          c.style.transform = `rotateY(${(delta * -8).toFixed(2)}deg)`;
        });
      };
      tiltPromos = tilt;
      let raf = null;
      carr.addEventListener(
        "scroll",
        () => {
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = null;
            tilt();
          });
        },
        { passive: true }
      );
      const avanzar = () => {
        if (carr.scrollWidth <= carr.clientWidth + 1) return; // grilla fija: sin auto-avance
        const card = carr.querySelector(".promo-card");
        if (!card) return;
        const paso = card.offsetWidth + 14;
        const maxScroll = carr.scrollWidth - carr.clientWidth;
        if (carr.scrollLeft >= maxScroll - 10) carr.scrollTo({ left: 0, behavior: "smooth" });
        else carr.scrollBy({ left: paso, behavior: "smooth" });
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // sin animación automática para usuarios que la desactivaron
      } else {
        let timer = setInterval(avanzar, 4500);
        const pausar = () => clearInterval(timer);
        const reanudar = () => {
          clearInterval(timer);
          timer = setInterval(avanzar, 4500);
        };
        carr.addEventListener("pointerenter", pausar);
        carr.addEventListener("pointerleave", reanudar);
        carr.addEventListener("touchstart", pausar, { passive: true });
        carr.addEventListener("touchend", reanudar, { passive: true });
      }
      tilt();
    }

    // ── Modal de sabores: steppers, confirmar y cerrar ──
    if (opts.modalSabores) {
      const CAP_MAX = typeof Cart !== "undefined" ? Cart.MAX_POR_ITEM : 20;
      opts.modalSabores.addEventListener("click", (e) => {
        if (e.target === opts.modalSabores) {
          cerrarModalSabores();
          return;
        }
        const btn = e.target.closest("[data-accion]");
        if (!btn) return;
        const accion = btn.dataset.accion;
        const s = btn.dataset.sabor;
        if (accion === "cerrar-sabores") cerrarModalSabores();
        else if (accion === "confirmar-sabores") confirmarSabores();
        else if (accion === "sabor-mas") {
          selSabores.cantidades[s] = Math.min(CAP_MAX, (selSabores.cantidades[s] || 0) + 1);
          pintarModalSabores();
        } else if (accion === "sabor-menos") {
          selSabores.cantidades[s] = Math.max(0, (selSabores.cantidades[s] || 0) - 1);
          pintarModalSabores();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !opts.modalSabores.hidden) cerrarModalSabores();
      });
    }
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

  return { init, refresh, filtrar, normalize, descuentoPromo, unidadTexto };
});
