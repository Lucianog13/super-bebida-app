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
    const d = fecha instanceof Date ? fecha : new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha + "T00:00:00" : fecha);
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

  // ¿El pedido se puede modificar? Regla: hasta las 23:59 del MISMO día (hora local del
  // dispositivo). La nube re-valida con la hora de Argentina (ventana a prueba de reloj).
  function puedeModificarse(fechaPedido, ahora) {
    const d = fechaPedido instanceof Date ? fechaPedido : new Date(fechaPedido);
    const n = ahora instanceof Date ? ahora : new Date(ahora || Date.now());
    if (isNaN(d.getTime()) || isNaN(n.getTime())) return false;
    return (
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate()
    );
  }

  function toWhatsAppText(pedido, modificacion) {
    const lines = [];
    if (modificacion) {
      const ref = pedido.cliente.nroCliente
        ? `MODIFICACIÓN PEDIDO CLIENTE Nº: ${pedido.cliente.nroCliente}`
        : `MODIFICACIÓN PEDIDO CLIENTE: ${pedido.cliente.nombre}`;
      lines.push(`*${ref}*`);
    } else {
      lines.push(`*PEDIDO — ${NOMBRE_NEGOCIO} S.R.L.*`);
    }
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

  function buildOrder(cliente, items, fecha, token) {
    const d = fecha || new Date();
    return {
      id: generateId(d),
      fecha: d.toISOString(),
      cliente,
      items: (items || []).map((i) => ({ ...i })),
      total: (items || []).reduce((s, i) => s + i.precioUnit * i.cantidad, 0),
      token: token || null,
    };
  }

  // Arma el pedido modificado: mismo id/fecha/cliente/token, items y total nuevos.
  function buildModificacion(original, items) {
    return {
      id: original.id,
      fecha: original.fecha,
      cliente: { ...(original.cliente || {}) },
      items: (items || []).map((i) => ({ ...i })),
      total: (items || []).reduce((s, i) => s + i.precioUnit * i.cantidad, 0),
      token: original.token || null,
      modificado: true,
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

  // Normaliza texto para comparar clientes (minúsculas, sin acentos ni puntuación).
  // Mismo criterio que la función SQL mis_pedidos.
  function normalizarTexto(s) {
    return (s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  // ¿El nombre tipeado coincide (laxo) con el guardado? Laxo = normalizados, uno es
  // subcadena del otro. Tolera mayúsculas, acentos, puntuación y palabras/sufijos de más
  // (ej. "Marcelo" vs "Marcelo González S.A.", o "Carlos R." vs "Carlos Rodríguez").
  // Mismo criterio que la nueva versión de la función SQL mis_pedidos (19/09/2026).
  function nombreCoincide(tipado, guardado) {
    const a = normalizarTexto(tipado);
    const b = normalizarTexto(guardado);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  // Fusiona pedidos locales con los de la nube: misma id → gana la nube (trae token).
  function fusionarPedidos(locales, nube) {
    const mapa = new Map();
    (locales || []).forEach((o) => mapa.set(o.id, o));
    (nube || []).forEach((o) => mapa.set(o.id, o));
    return Array.from(mapa.values()).sort(
      (a, b) => new Date(b.fecha) - new Date(a.fecha)
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
    buildModificacion,
    puedeModificarse,
    normalizarTexto,
    nombreCoincide,
    fusionarPedidos,
    findLastOrder,
    MIN_PEDIDO,
    faltanteMinimo,
  };
});
