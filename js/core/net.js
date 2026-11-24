// Helpers de red PUROS — sin DOM, sin estado global, sin dependencias.
// Patrón UMD mínimo: exporta a module.exports (Node) o a window.Net (navegador).
//  - fetchConTimeout(url, opciones, ms): fetch con timeout vía AbortController.
//  - conReintento(fn, {intentos, demoraMs}): ejecuta fn reintentando SOLO si rechaza.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Net = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  // Espera ms milisegundos (helper interno para espaciar los reintentos).
  function demorar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // fetch con timeout: si la respuesta no llega en `ms` milisegundos, se aborta
  // con AbortController y la promesa rechaza con AbortError (igual que un fetch
  // abortado a mano). `opciones` se pasa tal cual a fetch; si el llamador traía su
  // propio signal se combina con el del timeout cuando AbortSignal.any existe.
  function fetchConTimeout(url, opciones, ms) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const msVal = ms == null ? 8000 : ms; // por defecto, el timeout clásico de 8 s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), msVal);
    let signal = controller.signal;
    if (op.signal && typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      // Cualquiera de los dos signals aborta el fetch (el del timeout o el del llamador).
      signal = AbortSignal.any([controller.signal, op.signal]);
    }
    return fetch(url, { ...op, signal }).finally(() => clearTimeout(timeout));
  }

  // Ejecuta fn y reintenta SOLO si fn rechaza: cada rechazo espera demoraMs y se
  // vuelve a intentar hasta completar `intentos` (por defecto 2: un intento + un
  // reintento). Si fn resuelve, se devuelve ese valor sin reintentar. Si se agotan
  // los intentos, rechaza con el último error.
  function conReintento(fn, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const intentos = op.intentos != null && op.intentos > 0 ? op.intentos : 2;
    const demoraMs = op.demoraMs != null && op.demoraMs >= 0 ? op.demoraMs : 1500;
    let ultimoError = null;
    return (async () => {
      for (let i = 0; i < intentos; i++) {
        try {
          return await fn();
        } catch (err) {
          ultimoError = err;
          if (i < intentos - 1) await demorar(demoraMs);
        }
      }
      throw ultimoError;
    })();
  }

  return { fetchConTimeout, conReintento };
});
