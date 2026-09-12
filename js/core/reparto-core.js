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

  // Cliente por cliente con sus productos (sumados por línea). Devuelve:
  // [{ id, cliente, items: [{nombre, presentacion, unidad, cantidad}], total }]
  function agruparPorCliente(orders) {
    return (orders || []).map((p) => {
      const m = new Map();
      (p.items || []).forEach((it) => {
        const clave = `${it.nombre}|${it.presentacion || ""}|${it.unidad || ""}`;
        if (!m.has(clave)) {
          m.set(clave, { nombre: it.nombre, presentacion: it.presentacion || "", unidad: it.unidad || "", cantidad: 0 });
        }
        m.get(clave).cantidad += it.cantidad;
      });
      return {
        id: p.id,
        cliente: p.cliente || {},
        items: [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
        total: p.total || 0,
      };
    });
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
