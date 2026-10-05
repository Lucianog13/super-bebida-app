// Datos del cliente — normalización y validación del registro único ("login" de datos).
// Lógica pura, sin DOM. Patrón UMD mínimo: module.exports (Node) o window.Cliente (navegador).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Cliente = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const MAX = { nro: 10, nombre: 60, apellido: 60, direccion: 100 };

  // Saca caracteres de control y colapsa espacios.
  function limpiar(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function soloDigitos(s) {
    return limpiar(s).replace(/\D/g, "");
  }

  // Letras (con acentos, ñ, ü), espacios, apóstrofos, puntos y guiones.
  // Ej. válidos: "María del C.", "O'Connor", "Juan-Carlos". Ej. inválido: "Pedro123".
  function esNombreValido(s) {
    return /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ'’.\- ]+$/.test(s) && s.length >= 2;
  }

  /**
   * Valida los 4 campos del registro y devuelve el cliente normalizado.
   * Devuelve { ok, errores: {campo: mensaje}, cliente: {nroCliente, nombre, apellido, direccion} }.
   * El Nº se exige SOLO con dígitos: no se limpia en silencio (evita que "11a2" matchee al 112).
   */
  function validar({ nroCliente, nombre, apellido, direccion }) {
    const errores = {};

    const nroRaw = limpiar(nroCliente);
    if (!nroRaw) errores.nro = "Ingresá tu número de cliente.";
    else if (!/^\d+$/.test(nroRaw)) errores.nro = "El número va solo con dígitos.";
    else if (nroRaw.length > MAX.nro) errores.nro = "El número es demasiado largo.";

    const nom = limpiar(nombre);
    if (!nom) errores.nombre = "Ingresá tu nombre.";
    else if (!esNombreValido(nom)) errores.nombre = "El nombre tiene caracteres inválidos.";
    else if (nom.length > MAX.nombre) errores.nombre = "Nombre demasiado largo.";

    const ape = limpiar(apellido);
    if (!ape) errores.apellido = "Ingresá tu apellido.";
    else if (!esNombreValido(ape)) errores.apellido = "El apellido tiene caracteres inválidos.";
    else if (ape.length > MAX.apellido) errores.apellido = "Apellido demasiado largo.";

    const dir = limpiar(direccion);
    if (!dir) errores.direccion = "Ingresá tu dirección.";
    else if (dir.length < 3) errores.direccion = "Dirección demasiado corta.";
    else if (dir.length > MAX.direccion) errores.direccion = "Dirección demasiado larga.";

    const ok = Object.keys(errores).length === 0;
    return {
      ok,
      errores,
      cliente: ok ? { nroCliente: nroRaw, nombre: nom, apellido: ape, direccion: dir } : null,
    };
  }

  // "Nombre Apellido" listo para el pedido (remito, WhatsApp, historial).
  // Compatible con datos viejos (cliente.nombre ya combinado y sin apellido).
  function nombreCompleto(c) {
    if (!c) return "";
    return [c.nombre, c.apellido].filter(Boolean).map((s) => String(s).trim()).join(" ");
  }

  // Link wa.me: normaliza el teléfono (saca no-dígitos, antepone 54 a números de 10 dígitos).
  function waLink(tel, texto) {
    let d = String(tel || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.startsWith("0")) d = "54" + d.slice(1);
    else if (d.length === 10) d = "54" + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(texto || "")}`;
  }

  return { validar, nombreCompleto, waLink, soloDigitos, limpiar };
});
