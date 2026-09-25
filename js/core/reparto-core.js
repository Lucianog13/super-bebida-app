// Lógica pura de reparto (sin DOM, testeable con node:test):
// suma de productos, agrupado por cliente, zona más cercana y formato de día.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.RepartoCore = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  // Suma los productos repetidos de un conjunto de pedidos. Devuelve un array
  // ordenado alfabéticamente: [{ nombre, presentacion, unidad, cantidad }].
  function agregarItems(orders) {
    const agg = new Map();
    (orders || []).forEach((p) => (p.items || []).forEach((it) => {
      const clave = `${it.nombre}|${it.presentacion || ""}|${it.unidad || ""}`;
      if (!agg.has(clave)) {
        agg.set(clave, { nombre: it.nombre, presentacion: it.presentacion || "", unidad: it.unidad || "", cantidad: 0 });
      }
      agg.get(clave).cantidad += it.cantidad;
    }));
    return [...agg.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  // Cliente por cliente con sus productos (sumados por línea). Si el MISMO cliente
  // (mismo Nº de cliente, o mismo nombre + dirección) aparece en varios pedidos,
  // se FUSIONA en un solo bloque para no duplicarlo en la hoja (pedido de
  // Lisandro, 22/09/2026: unificar ayer + hoy sin duplicar clientes).
  // Devuelve: [{ id, cliente, items: [{nombre, presentacion, unidad, cantidad, precioUnit, total}], total }]
  function agruparPorCliente(orders) {
    const mapa = new Map();
    (orders || []).forEach((p) => {
      const c = p.cliente || {};
      const clave = c.nroCliente
        ? "N:" + String(c.nroCliente).trim()
        : "C:" + (c.nombre || "").trim().toLowerCase() + "|" + (c.direccion || "").trim().toLowerCase();
      let bloque = mapa.get(clave);
      if (!bloque) {
        bloque = { id: p.id, cliente: c, items: new Map(), total: 0 };
        mapa.set(clave, bloque);
      }
      (p.items || []).forEach((it) => {
        const k = `${it.nombre}|${it.presentacion || ""}|${it.unidad || ""}`;
        if (!bloque.items.has(k)) {
          bloque.items.set(k, { nombre: it.nombre, presentacion: it.presentacion || "", unidad: it.unidad || "", cantidad: 0, precioUnit: it.precioUnit || 0, total: 0 });
        }
        const linea = bloque.items.get(k);
        linea.cantidad += it.cantidad;
        linea.total += (it.precioUnit || 0) * it.cantidad;
      });
      bloque.total += (p.total || 0);
    });
    return [...mapa.values()].map((b) => ({
      id: b.id,
      cliente: b.cliente,
      items: [...b.items.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      total: b.total,
    }));
  }

  // ¿Dos conjuntos de pedidos forman la MISMA carga? Compara el agregado de
  // productos (nombre|presentacion|unidad → cantidad total) exactamente igual.
  // Sirve para avisar "hoy y ayer repartís lo mismo" (pedido de Lisandro, 22/09/2026).
  function mismaCarga(ordersA, ordersB) {
    const a = agregarItems(ordersA);
    const b = agregarItems(ordersB);
    if (!a.length || !b.length) return false; // un día sin pedidos no es "la misma carga"
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].nombre !== b[i].nombre ||
        a[i].presentacion !== b[i].presentacion ||
        a[i].unidad !== b[i].unidad ||
        a[i].cantidad !== b[i].cantidad
      ) return false;
    }
    return true;
  }

  // Zona cuyo centroide queda más cerca de (lat, lon).
  // zonas = { 1: {centro:{lat,lon}}, 2: {...} }.
  function asignarZona(lat, lon, zonas) {
    let mejor = 1, mejorD = Infinity;
    for (const k of Object.keys(zonas)) {
      const z = zonas[k];
      const d = (lat - z.centro.lat) ** 2 + (lon - z.centro.lon) ** 2;
      if (d < mejorD) { mejorD = d; mejor = parseInt(k, 10); }
    }
    return mejor;
  }

  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  // "Sábado 12 de Septiembre de 2026"
  function nombreDiaLargo(fecha) {
    const d = fecha instanceof Date
      ? fecha
      : new Date(/^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha + "T00:00:00" : fecha);
    if (isNaN(d.getTime())) return "";
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // Prioridad de la zona de un pedido (pedido de Tincho/Lisandro, 22/09/2026):
  // 1) zona manual del pedido, 2) override de sesión, 3) zona del cliente
  // (persistida), 4) zona por geocodificación. Devuelve 1 | 2 | 0.
  function prioridadZona(zonaPedido, zonaOverride, zonaCliente, zonaGeo) {
    if (zonaPedido === 1 || zonaPedido === 2) return zonaPedido;
    if (zonaOverride === 1 || zonaOverride === 2) return zonaOverride;
    if (zonaCliente === 1 || zonaCliente === 2) return zonaCliente;
    if (zonaGeo === 1 || zonaGeo === 2) return zonaGeo;
    return 0;
  }

  return { agregarItems, agruparPorCliente, asignarZona, nombreDiaLargo, mismaCarga, prioridadZona };
});
