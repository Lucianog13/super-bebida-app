// Vista "Reparto": mapa con los pedidos del día, división automática por zona
// y generación de las hojas de carga (Control de Carga + Hoja de Clientes) por zona.
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

  async function geocodificar(dir) {
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
    for (const p of faltan) {
      const dir = (p.cliente && p.cliente.direccion) || "";
      const g = await geocodificar(dir);
      if (g) { geocache.set(dir, g); p._geo = g; }
      await sleep(1100); // respetar el rate limit de Nominatim (1 req/seg)
    }
    toastFn("", "");
  }

  function asignarZona(lat, lon) {
    const zonas = Z().zonas;
    let mejor = 1, mejorD = Infinity;
    for (const k of Object.keys(zonas)) {
      const z = zonas[k];
      const d = (lat - z.centro.lat) ** 2 + (lon - z.centro.lon) ** 2;
      if (d < mejorD) { mejorD = d; mejor = parseInt(k, 10); }
    }
    return mejor;
  }

  function zonaDe(p) {
    if (zonaOverride[p.id]) return zonaOverride[p.id];
    if (p._geo) return asignarZona(p._geo.lat, p._geo.lon);
    return 0; // sin dirección → sin zona (asignar a mano)
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
    if (!el || typeof L === "undefined") return;
    if (!mapa) {
      mapa = L.map("mapa-reparto").setView([Z().distribuidora.lat, Z().distribuidora.lon], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
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

  function hojaCargaHTML(zonaNum, tituloZona) {
    const ps = pedidosDeZona(zonaNum);
    const agg = new Map();
    ps.forEach((p) => (p.items || []).forEach((it) => {
      const clave = `${it.nombre}|${it.presentacion}|${it.unidad}`;
      if (!agg.has(clave)) agg.set(clave, { nombre: it.nombre, presentacion: it.presentacion, unidad: it.unidad, cantidad: 0 });
      agg.get(clave).cantidad += it.cantidad;
    }));
    const filas = [...agg.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((it) => `
        <tr>
          <td>${it.nombre}<span class="hc-desc">${it.presentacion}${it.unidad ? " · " + it.unidad : ""}</span></td>
          <td class="num">${it.cantidad}</td>
        </tr>`).join("");
    const ret = ps.reduce((s, p) => s + Order.envasesRetornables(p.items || []), 0);
    return `
    <div class="hoja-carga">
      <div class="hc-head">
        <div class="hc-titulo">El Super de la Bebida S.R.L.</div>
        <div class="hc-sub">Control de Carga</div>
        <div class="hc-fecha">${Order.formatDate(new Date())}</div>
      </div>
      <div class="hc-repartidor">Repartidor: ________ &nbsp;·&nbsp; ${tituloZona}</div>
      <table class="hc-tabla">
        <thead><tr><th>Artículo</th><th class="num">Total</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="2">Sin pedidos</td></tr>'}</tbody>
      </table>
      ${ret ? `<div class="hc-envases">Envases retornables: ${ret}</div>` : ""}
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
    imprimir(hojaCargaHTML(zonaNum, t));
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

  return { init, cargar, render };
});
