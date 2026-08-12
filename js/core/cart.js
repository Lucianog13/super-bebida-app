// Lógica pura del carrito — sin DOM, sin localStorage.
// Patrón UMD mínimo: exporta a module.exports (Node) o a window.Cart (navegador).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Cart = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  function addItem(cart, producto, cantidad = 1) {
    const items = (cart || []).map((i) => ({ ...i }));
    const idx = items.findIndex((i) => i.productoId === producto.id);
    if (idx >= 0) {
      items[idx].cantidad += cantidad;
    } else {
      items.push({
        productoId: producto.id,
        nombre: producto.nombre,
        presentacion: producto.presentacion || "",
        unidad: producto.unidad || "",
        emoji: producto.emoji || "",
        imagen: producto.imagen || "",
        precioUnit: producto.precio,
        precioAnterior: producto.precioAnterior || null,
        retornable: !!producto.retornable,
        cantidad,
      });
    }
    return items;
  }

  function updateQty(cart, id, cantidad) {
    return (cart || []).map((i) =>
      i.productoId === id ? { ...i, cantidad: Math.max(1, Math.floor(cantidad)) } : { ...i }
    );
  }

  function removeItem(cart, id) {
    return (cart || []).filter((i) => i.productoId !== id);
  }

  function find(cart, id) {
    return (cart || []).find((i) => i.productoId === id) || null;
  }

  function total(cart) {
    return (cart || []).reduce((s, i) => s + i.precioUnit * i.cantidad, 0);
  }

  function count(cart) {
    return (cart || []).reduce((s, i) => s + i.cantidad, 0);
  }

  return { addItem, updateQty, removeItem, find, total, count };
});
