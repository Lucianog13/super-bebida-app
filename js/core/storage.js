// Persistencia en localStorage — con guardas para entornos sin localStorage (Node).
// Patrón UMD mínimo: module.exports (Node) o window.Storage (navegador).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Storage = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const KEYS = { cart: "carrito", orders: "pedidos", cliente: "cliente" };

  function hasLS() {
    try {
      return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
      return false;
    }
  }

  function get(key, fallback) {
    if (!hasLS()) return fallback;
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }

  function set(key, val) {
    if (!hasLS()) return;
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* sin espacio o bloqueado: se ignora */
    }
  }

  return {
    saveCart: (cart) => set(KEYS.cart, cart),
    loadCart: () => get(KEYS.cart, []),

    saveOrder: (order) => {
      const list = get(KEYS.orders, []);
      list.push(order);
      set(KEYS.orders, list);
      return order;
    },
    loadOrders: () => get(KEYS.orders, []),

    saveCliente: (cliente) => set(KEYS.cliente, cliente),
    loadCliente: () => get(KEYS.cliente, null),
  };
});
