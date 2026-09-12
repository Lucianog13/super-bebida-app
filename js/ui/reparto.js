// Vista "Reparto": mapa con los pedidos del día, división automática por zona
// y generación de las hojas de carga (Control de Carga + Hoja de Clientes) por zona.
// v2 (2026-09-12): hojas de carga generalizadas a cualquier conjunto de pedidos
// (para el día seleccionado desde "Pedidos"), detección de zona reutilizable y
// hoja individual "por cliente" con productos.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Reparto = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  let pedidos = [];
  let mapa = null;
  let capaPedidos = null;
  const zonaOverride = {}; // pid -> zona (1|2)
  let unificado = false;
  let toastFn = () => {};

  const CFG = () => window.APP_CONFIG;
  const Z = () => window.ZONAS;
  const RC = () => window.RepartoCore;
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Cache de geocodificación (memoria + localStorage).
  const geocache = (() => {
    let mem = {};
    try { mem = JSON.parse(localStorage.getItem("reparto-geo") || "{}"); } catch {}
    return {
      get(d) { return mem[d] || null; },
      set(d, v) { mem[d] = v; try { localStorage.setItem("reparto-geo", JSON.stringify(mem)); } catch {} },
    };
  })();

  function esDeHoy(p) {
    const h = new Date();
    const f = new Date(p.fecha);
    return f.getFullYear() === h.getFullYear() && f.getMonth() === h.getMonth() && f.getDate() === h.getDate();
  }
  function delDia() { return pedidos.filter(esDeHoy); }

  async function cargar() {
    if (!window.Auth || !window.Auth.getSession()) return;
    const t = await window.Auth.token();
    if (!t) { toastFn("Sesión vencida — cerrá sesión y volvé a entrar", "error"); return; }
    const res = await fetch(`${CFG().supabaseUrl}/rest/v1/pedidos?select=*&order=fecha.desc`, {
      headers: { apikey: CFG().supabaseKey, Authorization: "Bearer " + t },
    });
    if (!res.ok) { toastFn("No se pudieron cargar los pedidos (HTTP " + res.status + ")", "error"); return; }
    pedidos = await res.json();
    await preparar();
    render();
  }

  // Geocodificación con deduplicación de pedidos en vuelo (evita doble consulta
  // si "Pedidos" y "Reparto" geocodifican la misma dirección a la vez).
  const enVuelo = new Map();
  function geocodificar(dir) {
    if (enVuelo.has(dir)) return enVuelo.get(dir);
    const p = _geocodificar(dir).finally(() => enVuelo.delete(dir));
    enVuelo.set(dir, p);
    return p;
  }
  async function _geocodificar(dir) {
    try {
      const q = `${dir}, Paraná, Entre Ríos, Argentina`;
      const url = NOMINATIM + "?format=json&limit=1&countrycodes=ar&q=" + encodeURIComponent(q);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch { return null; }
  }

  async function preparar() {
    const hoy = delDia();
    const faltan = hoy.filter((p) => {
      const dir = (p.cliente && p.cliente.direccion) || "";
      return dir && !geocache.get(dir);
    });
    hoy.forEach((p) => {
      const dir = (p.cliente && p.cliente.direccion) || "";
      p._geo = dir ? geocache.get(dir) : null;
    });
    if (!faltan.length) return;
    toastFn("Ubicando direcciones en el mapa… (" + faltan.length + ")", "");
    let fallas = 0;
    for (const p of faltan) {
      const dir = (p.cliente && p.cliente.direccion) || "";
      const g = await geocodificar(dir);
      if (g) { geocache.set(dir, g); p._geo = g; } else { fallas++; }
      await sleep(1100); // respetar el rate limit de Nominatim (1 req/seg)
    }
    if (fallas) {
      toastFn(`No se pudieron ubicar ${fallas} dirección${fallas === 1 ? "" : "es"} (el servicio de mapas rechazó el pedido — reintentá en unos minutos)`, "error");
    } else {
      toastFn("", "");
    }
  }

  function asignarZona(lat, lon) {
    return RC().asignarZona(lat, lon, Z().zonas);
  }

  function zonaDe(p) {
    if (zonaOverride[p.id]) return zonaOverride[p.id];
    if (p._geo) return asignarZona(p._geo.lat, p._geo.lon);
    return 0; // sin dirección → sin zona (asignar a mano)
  }

  // Zona disponible SIN geocodificar (solo caché + _geo). Rápida, para la vista
  // "Pedidos"; si no está resuelta devuelve 0 y la resuelve detectarZonas().
  function zonaCacheada(p) {
    if (zonaOverride[p.id]) return zonaOverride[p.id];
    const dir = (p.cliente && p.cliente.direccion) || "";
    const g = p._geo || (dir ? geocache.get(dir) : null);
    if (g) return asignarZona(g.lat, g.lon);
    return 0;
  }

  // Geocodifica (con rate limit de 1 req/seg) los pedidos sin zona y avisa por
  // callback (pid, zona, {hecho, total}). Devuelve cuántas direcciones se ubicaron.
  async function detectarZonas(orders, onZona) {
    const faltan = (orders || []).filter((p) => {
      const dir = (p.cliente && p.cliente.direccion) || "";
      if (!dir) return false;
      if (p._geo) return false;
      const c = geocache.get(dir);
      if (c) { p._geo = c; return false; }
      return true;
    });
    let ok = 0;
    for (let i = 0; i < faltan.length; i++) {
      const p = faltan[i];
      const dir = (p.cliente && p.cliente.direccion) || "";
      const g = await geocodificar(dir);
      if (g) { geocache.set(dir, g); p._geo = g; ok++; }
      if (onZona) onZona(p.id, zonaDe(p), { hecho: i + 1, total: faltan.length });
      await sleep(1100);
    }
    return ok;
  }

  function colorZona(z) {
    return z === 1 ? Z().zonas[1].color : z === 2 ? Z().zonas[2].color : "#8a93a0";
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    renderMapa();
    renderLista();
    renderResumen();
  }

  function renderMapa() {
    const el = document.getElementById("mapa-reparto");
    if (!el) return;
    if (typeof L === "undefined") {
      el.innerHTML = '<div class="mapa-error">No se pudo cargar el mapa (CDN no disponible). Recargá la página.</div>';
      return;
    }
    if (!mapa) {
      mapa = L.map("mapa-reparto").setView([Z().distribuidora.lat, Z().distribuidora.lon], 12);
      // Esri World Street Map: tiles gratuitos SIN API key y sin los bloqueos de OSM
      // (tile.openstreetmap.org bloquea por IP/uso y Carto ahora exige key).
      // Ojo: el orden de las variables es {z}/{y}/{x} (Esri invierte x e y).
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Powered by Esri",
        maxZoom: 19,
      }).addTo(mapa);
      capaPedidos = L.layerGroup().addTo(mapa);
    }
    capaPedidos.clearLayers();

    // distribuidora
    const d = Z().distribuidora;
    L.marker([d.lat, d.lon]).addTo(capaPedidos)
      .bindPopup(`<b>${d.nombre}</b>`);

    // áreas de las zonas (círculos aproximados para visualizar)
    for (const k of Object.keys(Z().zonas)) {
      const z = Z().zonas[k];
      L.circle([z.centro.lat, z.centro.lon], {
        radius: 1800, color: z.color, weight: 2, fillColor: z.color, fillOpacity: 0.08,
      }).addTo(capaPedidos).bindPopup(`<b>${z.nombre}</b>`);
    }

    // pedidos del día
    delDia().forEach((p) => {
      if (!p._geo) return;
      const z = zonaDe(p);
      const c = p.cliente || {};
      L.circleMarker([p._geo.lat, p._geo.lon], {
        radius: 8, color: colorZona(z), weight: 2, fillColor: colorZona(z), fillOpacity: 0.85,
      }).addTo(capaPedidos).bindPopup(
        `<b>${c.nombre || "—"}</b><br>${c.direccion || ""}<br>${z ? "Zona " + z : "Sin zona"} · ${Order.formatMoney(p.total)}`
      );
    });

    // ajustar vista para que entren todos los marcadores
    try {
      const bounds = L.latLngBounds(
        delDia().filter((p) => p._geo).map((p) => [p._geo.lat, p._geo.lon])
      );
      if (bounds.isValid()) { bounds.extend([d.lat, d.lon]); mapa.fitBounds(bounds, { padding: [30, 30] }); }
    } catch {}
  }

  function renderLista() {
    const el = document.getElementById("lista-reparto");
    const hoy = delDia();
    if (!hoy.length) {
      el.innerHTML = '<p class="carrito-vacio">No hay pedidos para hoy todavía.</p>';
      return;
    }
    el.innerHTML = hoy.map((p) => {
      const z = zonaDe(p);
      const c = p.cliente || {};
      const n = (p.items || []).length;
      return `
      <div class="rep-fila" data-id="${p.id}">
        <span class="rep-punto" style="background:${colorZona(z)}"></span>
        <div class="rep-cuerpo">
          <div class="rep-cliente"><strong>${c.nombre || "—"}</strong>${c.nroCliente ? " · Nº " + c.nroCliente : ""}</div>
          <div class="rep-dir">${c.direccion || "sin dirección"}${c.telefono ? " · " + c.telefono : ""}</div>
          <div class="rep-items">${n} item${n === 1 ? "" : "s"} · ${Order.formatMoney(p.total)}</div>
        </div>
        <div class="rep-zona">
          <span class="rep-zona-label" style="color:${colorZona(z)}">${z ? "Zona " + z : "Sin zona"}</span>
          <div class="rep-zona-botones">
            <button class="btn mini ${z === 1 ? "primary" : "outline"}" data-accion="zona" data-zona="1">Z1</button>
            <button class="btn mini ${z === 2 ? "primary" : "outline"}" data-accion="zona" data-zona="2">Z2</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  function renderResumen() {
    const el = document.getElementById("reparto-resumen");
    const hoy = delDia();
    const z1 = hoy.filter((p) => zonaDe(p) === 1).length;
    const z2 = hoy.filter((p) => zonaDe(p) === 2).length;
    const sin = hoy.filter((p) => zonaDe(p) === 0).length;
    el.innerHTML =
      `<span class="chip-resumen">Zona 1: <strong>${z1}</strong> pedidos</span>` +
      `<span class="chip-resumen">Zona 2: <strong>${z2}</strong> pedidos</span>` +
      (sin ? `<span class="chip-resumen alerta">${sin} sin ubicar</span>` : "");
    // sugerencia de unificación
    const btn = document.getElementById("btn-unificar");
    if (btn) {
      const poco = (z1 > 0 && z1 <= 4) || (z2 > 0 && z2 <= 4);
      btn.textContent = unificado ? "🔓 Separar en 2 cargas" : "🔗 Unificar en una sola carga";
      btn.classList.toggle("primary", unificado);
      btn.classList.toggle("outline", !unificado);
      const sug = document.getElementById("sugerencia-unificar");
      if (sug) sug.hidden = !(poco && !unificado && z1 > 0 && z2 > 0);
    }
  }

  function cambiarZona(pid, zona) {
    zonaOverride[pid] = zona;
    render();
    toastFn("Pedido movido a Zona " + zona);
  }

  function alternarUnificar() {
    unificado = !unificado;
    renderResumen();
    toastFn(unificado ? "Cargas unificadas (una sola)" : "Cargas separadas por zona");
  }

  // ── Hojas de carga ────────────────────────────────────────────────────────
  function pedidosDeZona(zona) {
    const hoy = delDia();
    if (unificado) return hoy;
    return hoy.filter((p) => zonaDe(p) === zona);
  }

  // Control de Carga (sumado por producto). Recibe los pedidos explícitos; la
  // fecha sale del primer pedido (el día seleccionado), no de "hoy".
  function hojaCargaHTML(orders, tituloZona) {
    const ps = orders || [];
    const filas = RC().agregarItems(ps).map((it) => `
        <tr>
          <td>${it.nombre}</td>
          <td class="num">${it.cantidad}</td>
        </tr>`).join("");
    const ret = ps.reduce((s, p) => s + Order.envasesRetornables(p.items || []), 0);
    const fecha = (ps[0] && ps[0].fecha) || new Date();
    return `
    <div class="hoja-carga">
      <div class="hc-head">
        <div class="hc-titulo">El Super de la Bebida S.R.L.</div>
        <div class="hc-sub">Control de Carga</div>
        <div class="hc-fecha">${RC().nombreDiaLargo(fecha)}</div>
      </div>
      <div class="hc-repartidor">Repartidor: ________ &nbsp;·&nbsp; ${tituloZona}</div>
      <table class="hc-tabla">
        <thead><tr><th>Artículo</th><th class="num">Total</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="2">Sin pedidos</td></tr>'}</tbody>
      </table>
      ${ret ? `<div class="hc-envases">Envases retornables: ${ret}</div>` : ""}
    </div>`;
  }

  // Hoja individual: cliente por cliente con sus productos (nombre + zona).
  function hojaIndividualHTML(orders, tituloZona) {
    const ps = orders || [];
    const fecha = (ps[0] && ps[0].fecha) || new Date();
    const totalCarga = ps.reduce((s, p) => s + (p.total || 0), 0);
    const porId = new Map(ps.map((p) => [p.id, p]));
    const bloques = RC().agruparPorCliente(ps).map((c) => {
      const cli = c.cliente || {};
      const z = zonaDe(porId.get(c.id));
      const zTxt = z ? "Zona " + z : "Sin zona";
      const filas = c.items.map((it) => `<div class="hc-item">${it.nombre} — <strong>${it.cantidad}</strong></div>`).join("");
      return `
      <div class="hc-cliente">
        <div class="hc-c-nombre">${cli.nombre || "—"}${cli.nroCliente ? ' <span class="hc-nro">Nº ' + cli.nroCliente + "</span>" : ""} <span class="hc-nro">· ${zTxt}</span></div>
        <div class="hc-c-dir">${cli.direccion || ""}${cli.telefono ? " · " + cli.telefono : ""}</div>
        ${filas}
        <div class="hc-c-total">${Order.formatMoney(c.total)}</div>
      </div>`;
    }).join("");
    return `
    <div class="hoja-carga">
      <div class="hc-head">
        <div class="hc-titulo">El Super de la Bebida S.R.L.</div>
        <div class="hc-sub">Hoja por Cliente — ${tituloZona}</div>
        <div class="hc-fecha">${RC().nombreDiaLargo(fecha)}</div>
      </div>
      <div class="hc-repartidor">Repartidor: ________ &nbsp;·&nbsp; ${ps.length} cliente${ps.length === 1 ? "" : "s"}</div>
      ${bloques || '<p class="hc-vacio">Sin pedidos</p>'}
      <div class="hc-total-carga">
        <span>${ps.length} pedido${ps.length === 1 ? "" : "s"}</span>
        <strong>TOTAL DE LA CARGA: ${Order.formatMoney(totalCarga)}</strong>
      </div>
    </div>`;
  }

  function hojaClientesHTML(zonaNum, tituloZona) {
    const ps = pedidosDeZona(zonaNum);
    const totalCarga = ps.reduce((s, p) => s + (p.total || 0), 0);
    const filas = ps.map((p) => {
      const c = p.cliente || {};
      return `
      <tr>
        <td>${c.nombre || "—"}${c.nroCliente ? ' <span class="hc-nro">Nº ' + c.nroCliente + "</span>" : ""}</td>
        <td>${c.direccion || ""}${c.telefono ? " · " + c.telefono : ""}</td>
        <td class="num">${Order.formatMoney(p.total)}</td>
      </tr>`;
    }).join("");
    return `
    <div class="hoja-carga">
      <div class="hc-head">
        <div class="hc-titulo">El Super de la Bebida S.R.L.</div>
        <div class="hc-sub">Hoja de Clientes — ${tituloZona}</div>
        <div class="hc-fecha">${Order.formatDate(new Date())}</div>
      </div>
      <div class="hc-repartidor">Repartidor: ________ &nbsp;·&nbsp; ${ps.length} cliente${ps.length === 1 ? "" : "s"}</div>
      <table class="hc-tabla">
        <thead><tr><th>Cliente</th><th>Dirección</th><th class="num">Total</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="3">Sin pedidos</td></tr>'}</tbody>
      </table>
      <div class="hc-total-carga">
        <span>${ps.length} pedido${ps.length === 1 ? "" : "s"}</span>
        <strong>TOTAL DE LA CARGA: ${Order.formatMoney(totalCarga)}</strong>
      </div>
    </div>`;
  }

  function imprimir(html) {
    const zona = document.getElementById("zona-impresion");
    zona.innerHTML = html;
    window.print();
  }

  function imprimirCarga(zonaNum) {
    const t = unificado ? "Carga única (unificada)" : "Zona " + zonaNum;
    imprimir(hojaCargaHTML(pedidosDeZona(zonaNum), t));
  }
  function imprimirClientes(zonaNum) {
    const t = unificado ? "Clientes — carga única (unificada)" : "Zona " + zonaNum;
    imprimir(hojaClientesHTML(zonaNum, t));
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(o) {
    toastFn = o.toast || toastFn;
    document.getElementById("btn-reparto-cargar").addEventListener("click", cargar);
    document.getElementById("btn-unificar").addEventListener("click", alternarUnificar);
    document.getElementById("btn-carga-z1").addEventListener("click", () => imprimirCarga(1));
    document.getElementById("btn-carga-z2").addEventListener("click", () => imprimirCarga(2));
    document.getElementById("btn-clientes-z1").addEventListener("click", () => imprimirClientes(1));
    document.getElementById("btn-clientes-z2").addEventListener("click", () => imprimirClientes(2));
    document.getElementById("lista-reparto").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-accion='zona']");
      if (!btn) return;
      const pid = btn.closest(".rep-fila").dataset.id;
      cambiarZona(pid, parseInt(btn.dataset.zona, 10));
    });
  }

  return {
    init, cargar, render,
    // Helpers para la vista "Pedidos" (app.js):
    zonaCacheada,
    detectarZonas,
    hojaCargaHTML,
    hojaIndividualHTML,
    imprimirHTML: imprimir,
  };
});
