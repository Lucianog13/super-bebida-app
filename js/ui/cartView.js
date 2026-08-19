// Vista del carrito: filas con thumbnail, stepper, subtotales y total.
// Solo toca el DOM; la lógica pura vive en js/core/.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CartUI = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const ICONO_TACHO =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  function filaHTML(it) {
    const alTope = it.cantidad >= Cart.MAX_POR_ITEM;
    const foto = it.imagen
      ? `<img class="thumb" src="${it.imagen}" alt="" loading="lazy" onerror="this.remove()">`
      : `<span class="thumb">${it.emoji || "📦"}</span>`;
    const tachado = it.precioAnterior
      ? `<span class="precio-anterior">${Order.formatMoney(it.precioAnterior)}</span> `
      : "";
    return `
      <div class="fila-item" data-id="${it.productoId}">
        ${foto}
        <div class="info">
          <div class="nombre">${it.nombre}</div>
          <div class="detalle">${it.presentacion}${it.unidad ? " · " + it.unidad : ""}</div>
          <div class="unit">${tachado}<strong>${Order.formatMoney(it.precioUnit)}</strong> c/u</div>
        </div>
        <div class="lado">
          <div class="subtotal">${Order.formatMoney(it.precioUnit * it.cantidad)}</div>
          <div class="cant-controles">
            <button data-accion="menos" aria-label="Quitar uno">−</button>
            <span class="qty">${it.cantidad}</span>
            <button data-accion="mas" aria-label="Agregar uno" ${alTope ? 'disabled title="Máximo 20 unidades por producto"' : ""}>+</button>
          </div>
          <button class="btn-eliminar" data-accion="eliminar">${ICONO_TACHO} Quitar</button>
        </div>
      </div>`;
  }

  // Snapshot viva del carrito: se refresca en CADA render para que los clics
  // siempre operen sobre el estado actual (bug viejo: usaba el array del primer
  // render y por eso "+" se frenaba en 2 y "Quitar" borraba lo que no debía).
  let currentItems = [];
  let currentHandlers = null;

  function render(itemsContainer, totalContainer, items, handlers) {
    currentItems = items;
    currentHandlers = handlers;

    itemsContainer.innerHTML = items.length
      ? items.map(filaHTML).join("")
      : '<p class="carrito-vacio">El carrito está vacío.<br>Volvé al catálogo para agregar productos.</p>';

    totalContainer.innerHTML =
      `<div class="resumen"><span>Total del pedido</span><span>${Cart.count(items)} ${
        Cart.count(items) === 1 ? "item" : "items"
      }</span></div>` +
      `<span class="monto">${Order.formatMoney(Cart.total(items))}</span>`;

    if (!itemsContainer._bound) {
      itemsContainer._bound = true;
      itemsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-accion]");
        if (!btn) return;
        const fila = btn.closest("[data-id]");
        const id = fila.dataset.id;
        const accion = btn.dataset.accion;
        const item = Cart.find(currentItems, id);
        if (!item) return;
        let nuevo = currentItems;
        if (accion === "mas") nuevo = Cart.updateQty(currentItems, id, item.cantidad + 1);
        else if (accion === "menos") nuevo = Cart.updateQty(currentItems, id, item.cantidad - 1);
        else if (accion === "eliminar") nuevo = Cart.removeItem(currentItems, id);
        if (nuevo !== currentItems) currentHandlers.onUpdate(nuevo);
      });
    }
  }

  return { render };
});
