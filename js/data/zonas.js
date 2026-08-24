// Zonas de reparto de El Super de la Bebida (Paraná, Entre Ríos).
// Coordenadas geocodificadas con Nominatim (agosto 2026).
// La división automática usa "vecino más cercano al centroide de cada zona";
// Lucho puede corregir cada pedido a mano desde la vista Reparto.
(function (root) {
  root.ZONAS = {
    distribuidora: { lat: -31.771141, lon: -60.4973613, nombre: "Distribuidora (Miguel David 2119)" },
    zonas: {
      1: {
        nombre: "Zona 1",
        // centro de la ciudad (Plaza 1º de Mayo) + Almafuerte + Blas Parera + 25 de Mayo
        centro: { lat: -31.7446, lon: -60.4983 },
        color: "#1a7f37",
      },
      2: {
        nombre: "Zona 2",
        // San Benito + Aeropuerto + Barrio Capibá
        centro: { lat: -31.7884, lon: -60.4734 },
        color: "#c98a1b",
      },
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
