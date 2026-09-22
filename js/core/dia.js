// Fecha "de negocio" en hora argentina (America/Argentina/Buenos_Aires).
// La app guarda fechas en ISO UTC; el día de un pedido debe calcularse SIEMPRE
// con esta zona (no con la hora de la PC), para que "hoy" sea el día argentino
// aunque la máquina del depósito tenga otra zona horaria.
// Patrón UMD mínimo: module.exports (Node) o window.Dia (navegador).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Dia = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const TZ_ARG = "America/Argentina/Buenos_Aires";

  // Fecha válida a partir de cualquier input (Date | ISO string | YYYY-MM-DD).
  // "YYYY-MM-DD" se interpreta como día civil del negocio (mediodía, sin correrse).
  function aFecha(fecha) {
    if (fecha instanceof Date) return isNaN(fecha.getTime()) ? null : fecha;
    if (typeof fecha === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [y, m, d] = fecha.split("-").map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
      }
      const d = new Date(fecha);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // { y, m, d } del instante visto desde Argentina (null si inválido).
  function claveDia(fecha) {
    const d = aFecha(fecha);
    if (!d) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ_ARG,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")) };
  }

  // Clave del día civil "hoy + offset" (0 = hoy, -1 = ayer) en Argentina.
  function claveDiaOffset(offset, ahora) {
    const ref = ahora instanceof Date ? ahora : new Date(ahora || Date.now());
    const hoy = claveDia(ref);
    if (!hoy) return null;
    const t = new Date(Date.UTC(hoy.y, hoy.m - 1, hoy.d + (offset || 0)));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function mismaClave(a, b) {
    return !!(a && b && a.y === b.y && a.m === b.m && a.d === b.d);
  }

  // ¿La fecha cae en el día "hoy + offset" (argentino)?
  function mismoDia(fecha, offset, ahora) {
    return mismaClave(claveDia(fecha), claveDiaOffset(offset, ahora));
  }

  // Filtra pedidos por su fecha = día "hoy + offset" (0 hoy, -1 ayer).
  function filtrarDia(orders, offset, ahora) {
    return (orders || []).filter((p) => p && mismoDia(p.fecha, offset, ahora));
  }

  // ¿La fecha cae en alguno de los días "hoy + offset"? offsets [0,-1] = hoy y ayer.
  function enDias(fecha, offsets, ahora) {
    const k = claveDia(fecha);
    if (!k) return false;
    return (offsets || []).some((o) => mismaClave(k, claveDiaOffset(o, ahora)));
  }

  // Filtra pedidos cuya fecha cae en CUALQUIERA de los días pedidos (ej. [0,-1]).
  // Preserva el orden de entrada (la nube ya viene ordenada por fecha desc).
  function filtrarDias(orders, offsets, ahora) {
    return (orders || []).filter((p) => p && enDias(p.fecha, offsets, ahora));
  }

  // "22 de septiembre de 2026" — etiqueta para agrupar en la vista Pedidos.
  function fechaClave(fecha) {
    const d = aFecha(fecha);
    if (!d) return "";
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ_ARG,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  // "22/09/2026" — fecha corta en hora argentina (remito / WhatsApp).
  function formatFechaCorta(fecha) {
    const d = aFecha(fecha);
    if (!d) return "";
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ_ARG,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  }

  // "Martes 22 de Septiembre de 2026" — encabezado de las hojas de carga.
  function nombreDiaLargo(fecha) {
    const d = aFecha(fecha);
    if (!d) return "";
    const parts = new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ_ARG,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
    return `${cap(g("weekday"))} ${g("day")} de ${cap(g("month"))} de ${g("year")}`;
  }

  return {
    TZ_ARG,
    aFecha,
    claveDia,
    claveDiaOffset,
    mismaClave,
    mismoDia,
    filtrarDia,
    enDias,
    filtrarDias,
    fechaClave,
    formatFechaCorta,
    nombreDiaLargo,
  };
});
