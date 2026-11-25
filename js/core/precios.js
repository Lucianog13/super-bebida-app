// Lógica pura de precios por sabor — sin DOM, sin fetch, sin dependencias.
// Patrón UMD mínimo: exporta a module.exports (Node, tests) o a window.Precios
// (navegador). Resuelve el bug "el jefe cambia el precio general y el celular
// sigue mostrando el viejo": el admin re-enviaba los precios por sabor viejos
// al guardar, y el catálogo los mostraba ANTES que el precio general.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Precios = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ReconciliarPreciosSabores: arma el mapa `sabores_precios` que se guarda en la
  // base cuando el jefe guarda un producto con sabores desde el admin.
  // Reglas (en orden):
  //   1. Sabor editado a mano por el jefe en esta pantalla → vale lo que puso;
  //      si lo dejó vacío, ese sabor usa el precio general.
  //   2. Sabor que estaba al precio general VIEJO → sigue automáticamente al
  //      precio general NUEVO (el cambio de precio SIEMPRE impacta).
  //   3. Sabor con precio propio distinto del general → conserva su precio
  //      (la diferencia se mantiene).
  //   4. Si al final todos los valores quedan iguales al precio general nuevo,
  //      devuelve null: el catálogo usa el precio general y la base queda limpia.
  function ReconciliarPreciosSabores({ baseVieja, baseNueva, sabores, mapaViejo, tocados, valores }) {
    const viejo = mapaViejo && typeof mapaViejo === "object" ? mapaViejo : {};
    const toc = tocados instanceof Set ? tocados : new Set();
    const mapa = {};
    for (const s of sabores || []) {
      if (toc.has(s)) {
        const v = valores ? valores[s] : null;
        if (Number.isFinite(v) && v > 0) mapa[s] = v;
        // vacío/0 → se omite: ese sabor usa el precio general.
      } else if (viejo[s] != null && Number.isFinite(viejo[s])) {
        mapa[s] = viejo[s] === baseVieja ? baseNueva : viejo[s];
      }
      // sabor sin entrada previa y sin tocar → se omite: usa el precio general.
    }
    const distintos = Object.values(mapa).filter((v) => v !== baseNueva);
    return distintos.length > 0 ? mapa : null;
  }

  // NormalizarPreciosSabores: defensa al RENDERIZAR (catálogo, carrito).
  // Si el mapa solo repite el precio general, no aporta nada y se ignora:
  // evita que un mapa viejo/desincronizado pise un precio general recién cambiado.
  function NormalizarPreciosSabores(producto) {
    if (!producto) return null;
    const m =
      producto.sabores_precios && typeof producto.sabores_precios === "object"
        ? producto.sabores_precios
        : null;
    if (!m) return null;
    const vals = Object.values(m).filter((v) => typeof v === "number");
    if (!vals.length) return null;
    return vals.every((v) => v === producto.precio) ? null : m;
  }

  // PrecioFrescoItem: precio ACTUAL de la nube para una línea del carrito.
  // Devuelve { precioUnit, precioAnterior } (o null si el producto ya no está).
  function PrecioFrescoItem(item, mapaProductos) {
    const p = mapaProductos && mapaProductos[item.productoId];
    if (!p) return null;
    let precio = p.precio;
    const sp = NormalizarPreciosSabores(p);
    if (item.sabor && sp && typeof sp[item.sabor] === "number") precio = sp[item.sabor];
    return { precioUnit: precio, precioAnterior: p.precioAnterior || null };
  }

  // AplicarPreciosFrescos: pisa cada línea del carrito con su precio actual.
  // Las líneas cuyo producto ya no existe se dejan tal cual (sin tocar).
  function AplicarPreciosFrescos(items, mapaProductos) {
    return (items || []).map((item) => {
      const f = PrecioFrescoItem(item, mapaProductos);
      return f ? { ...item, precioUnit: f.precioUnit, precioAnterior: f.precioAnterior } : item;
    });
  }

  // SinStockEnCarrito: nombres de las líneas del carrito cuyo producto (o sabor)
  // quedó SIN STOCK según el catálogo fresco. Vacío = todo disponible.
  function SinStockEnCarrito(items, mapaProductos) {
    const nombres = [];
    for (const item of items || []) {
      const p = mapaProductos && mapaProductos[item.productoId];
      if (!p) continue; // producto dado de baja: no se bloquea acá
      const saborFuera =
        item.sabor && Array.isArray(p.sabores_sin_stock) && p.sabores_sin_stock.indexOf(item.sabor) !== -1;
      if (p.activo === false || saborFuera) {
        nombres.push(item.nombre || item.productoId);
      }
    }
    return nombres;
  }

  return { ReconciliarPreciosSabores, NormalizarPreciosSabores, PrecioFrescoItem, AplicarPreciosFrescos, SinStockEnCarrito };
});
