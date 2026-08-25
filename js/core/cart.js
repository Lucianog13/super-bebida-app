// Lógica pura del carrito — sin DOM, sin localStorage.
// Patrón UMD mínimo: exporta a module.exports (Node) o a window.Cart (navegador).
// Soporta productos con sabores: cada sabor es una línea independiente del carrito.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Cart = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const MAX_POR_ITEM = 20; // tope de unidades por producto en un pedido

  function mismoItem(i, id, sabor) {
    return i.productoId === id && (i.sabor || "") === (sabor || "");
  }

  function addItem(cart, producto, cantidad = 1, sabor = "") {
    const items = (cart || []).map((i) => ({ ...i }));
    const saborClave = sabor || "";
    const idx = items.findIndex((i) => mismoItem(i, producto.id, saborClave));
    if (idx >= 0) {
      items[idx].cantidad = Math.min(MAX_POR_ITEM, items[idx].cantidad + cantidad);
    } else {
      items.push({
        productoId: producto.id,
        nombre: producto.nombre + (saborClave ? " — " + saborClave : ""),
        presentacion: producto.presentacion || "",
        unidad: producto.unidad || "",
        emoji: producto.emoji || "",
        imagen: producto.imagen || "",
        precioUnit: producto.precio,
        precioAnterior: producto.precioAnterior || null,
        retornable: !!producto.retornable,
        sabor: saborClave,
        cantidad: Math.min(MAX_POR_ITEM, cantidad),
      });
    }
    return items;
  }

  function updateQty(cart, id, cantidad, sabor = "") {
    return (cart || []).map((i) =>
      mismoItem(i, id, sabor)
        ? { ...i, cantidad: Math.min(MAX_POR_ITEM, Math.max(1, Math.floor(cantidad))) }
        : { ...i }
    );
  }

  function removeItem(cart, id, sabor = "") {
    return (cart || []).filter((i) => !mismoItem(i, id, sabor));
  }

  function find(cart, id, sabor = "") {
    return (cart || []).find((i) => mismoItem(i, id, sabor)) || null;
  }

  function total(cart) {
    return (cart || []).reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
  }

  function count(cart) {
    return (cart || []).reduce((s, i) => s + i.cantidad, 0);
  }

  return { addItem, updateQty, removeItem, find, total, count, MAX_POR_ITEM };
});
