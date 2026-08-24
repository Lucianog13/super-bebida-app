// Formato y armado del pedido — lógica pura.
// Patrón UMD mínimo: module.exports (Node) o window.Order (navegador).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Order = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const NOMBRE_NEGOCIO = "El Super de la Bebida";

  function formatMoney(n) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function formatDate(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  }

  function generateId(fecha) {
    const d = fecha || new Date();
    const p = (x, l = 2) => String(x).padStart(l, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rnd = p(Math.floor(Math.random() * 1000), 3);
    return `P-${stamp}-${rnd}`;
  }

  function envasesRetornables(items) {
    return (items || []).filter((i) => i.retornable).reduce((s, i) => s + i.cantidad, 0);
  }

  function toWhatsAppText(pedido) {
    const lines = [];
    lines.push(`*PEDIDO — ${NOMBRE_NEGOCIO} S.R.L.*`);
    lines.push(`Nº ${pedido.id}`);
    lines.push(`Fecha: ${formatDate(pedido.fecha)}`);
    lines.push(`Cliente: ${pedido.cliente.nombre}`);
    if (pedido.cliente.telefono) lines.push(`Tel: ${pedido.cliente.telefono}`);
    if (pedido.cliente.direccion) lines.push(`Dirección: ${pedido.cliente.direccion}`);
    if (pedido.cliente.nroCliente) lines.push(`Nº de cliente: ${pedido.cliente.nroCliente}`);
    lines.push("━━━━━━━━━━━━━━━━");
    pedido.items.forEach((it, i) => {
      const unidad = it.unidad ? ` · ${it.unidad}` : "";
      const subtotal = formatMoney(it.precioUnit * it.cantidad);
      lines.push(`• ${it.nombre} ${it.presentacion}${unidad} ×${it.cantidad} — ${subtotal}`);
    });
    lines.push("━━━━━━━━━━━━━━━━");
    lines.push(`*TOTAL: ${formatMoney(pedido.total)}*`);
    const ret = envasesRetornables(pedido.items);
    if (ret > 0) lines.push(`Envases retornables: ${ret}`);
    return lines.join("\n");
  }

  function buildOrder(cliente, items, fecha) {
    const d = fecha || new Date();
    return {
      id: generateId(d),
      fecha: d.toISOString(),
      cliente,
      items: (items || []).map((i) => ({ ...i })),
      total: (items || []).reduce((s, i) => s + i.precioUnit * i.cantidad, 0),
    };
  }

  // Pedido Fácil (estilo BEES): el pedido más reciente de un cliente.
  function findLastOrder(orders, clienteNombre) {
    const n = (clienteNombre || "").trim().toLowerCase();
    if (!n) return null;
    return (
      (orders || [])
        .filter((o) => (o.cliente.nombre || "").trim().toLowerCase() === n)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] || null
    );
  }

  // ── Pedido mínimo ──
  const MIN_PEDIDO = 80000; // $ARS — montos menores no califican como pedido

  function faltanteMinimo(total) {
    return Math.max(0, MIN_PEDIDO - (total || 0));
  }

  return {
    formatMoney,
    formatDate,
    generateId,
    envasesRetornables,
    toWhatsAppText,
    buildOrder,
    findLastOrder,
    MIN_PEDIDO,
    faltanteMinimo,
  };
});
