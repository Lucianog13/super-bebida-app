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
    const boton = sinStock
      ? `<button class="btn-agregar" disabled>Sin stock</button>`
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
    return `
      <article class="promo-card" data-id="${p.id}">
        ${foto}
        <span class="badge-promo">Promo</span>
        ${ahorro ? `<span class="promo-ahorro">−${ahorro}%</span>` : ""}
        <div class="promo-cuerpo">
          <div class="promo-nombre">${p.nombre}</div>
          <div class="promo-precios">${anterior}<span class="promo-precio">${Order.formatMoney(p.precio)}</span></div>
          <button class="btn-agregar" data-accion="agregar">${ICONO_PLUS} Agregar</button>
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

    // ── Carrusel de promos: agregar al carrito, efecto 3D y auto-avance ──
    if (opts.carruselPromos) {
      const carr = opts.carruselPromos;
      carr.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-accion='agregar']");
        if (!btn) return;
        const card = btn.closest("[data-id]");
        const producto = opts.productos.find((p) => p.id === card.dataset.id);
        if (producto) opts.onAdd(producto);
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
