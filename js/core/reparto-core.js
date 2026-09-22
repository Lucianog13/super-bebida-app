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
  // Devuelve: [{ id, cliente, items: [{nombre, presentacion, unidad, cantidad}], total }]
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
          bloque.items.set(k, { nombre: it.nombre, presentacion: it.presentacion || "", unidad: it.unidad || "", cantidad: 0 });
        }
        bloque.items.get(k).cantidad += it.cantidad;
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

  return { agregarItems, agruparPorCliente, asignarZona, nombreDiaLargo };
});
