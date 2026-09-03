// Overlay de sabores (2026-08-19, pedido de Lucho): productos que se venden con
// variedades. Este archivo sobrevive a la regeneración de products.js (parse_precios.py)
// porque se aplica encima del catálogo cargado (nube, caché o archivo local).
//
// - familias: id → nombre limpio + lista de sabores (un precio para todos).
// - ocultar: entradas del catálogo que quedan absorbidas por la familia (ej. las
//   aguas saborizadas repetidas). Se filtran de la vista de clientes.
//
// Para agregar un producto con sabores: copiar el patrón de una familia.
// Para cambiar la lista: editar el array. El admin también lo va a poder editar.
(function (root) {
  "use strict";
  root.SABORES_OVERLAY = {
    familias: {
      "biscochito-don-satur-dulce-salado-tortitas-u": {
        nombre: "Biscochito Don Satur",
        sabores: ["Dulce", "Salada", "Tortitas"],
      },
      "gallet-9-de-oro-clasica-agrid-azucr-u": {
        nombre: "Galletitas 9 de Oro",
        sabores: ["Clásica", "Agridulce", "Azucarada"],
      },
      "obleas-55grs-choco-vaini-frutilla-u": {
        nombre: "Obleas Tym 55grs",
        sabores: ["Vainilla y Frutilla", "Frutilla", "Vainilla", "Chocolate", "Dulce de Leche", "Ultra Cacao"],
      },
      "formis-55gr-frutiila-choco-dulce-d-leche-u": {
        nombre: "Formis 55GR",
        sabores: ["Frutilla", "Chocolate", "Dulce de Leche"],
      },
      "polvoritas-chocolate-vaini-fruti-choco-81gr-u": {
        nombre: "Polvoritas 81GR",
        sabores: ["Chocolate", "Vainilla", "Frutilla"],
      },
      "manaos-cola-nar-pom-lima-limon-citrus-manz-granadina-3lt-pac": {
        nombre: "Manaos 3L",
        sabores: ["Cola", "Naranja", "Pomelo", "Lima", "Limón", "Citrus", "Manzana", "Granadina"],
      },
      "saladix-caja-pack-x6": {
        nombre: "Saladix Caja",
        sabores: ["Jamón", "Pizza", "Cheddar", "Calabresa", "Dúo"],
      },
      "tira-saladix-pack-x6": {
        nombre: "Tira Saladix",
        sabores: ["Jamón", "Pizza", "Cheddar", "Calabresa", "Dúo"],
      },
      "planet-nar-pom-lima-sierra-de-los-padres-1-5lt-pack-x6": {
        nombre: "Planet 1,5L",
        sabores: ["Naranja", "Pomelo", "Lima"],
      },
      "agua-sab-1-5-manzana-sierra-de-los-padres-pack-x6": {
        nombre: "Agua Saborizada 1,5L",
        sabores: ["Manzana", "Naranja", "Pomelo", "Pomelo c/gas", "Citrus c/gas", "Tónica", "Pomelo Rosado"],
      },
      "agua-sab-500ml-manzana-s-los-padres-pack-x12": {
        nombre: "Agua Saborizada 500ML",
        sabores: ["Manzana", "Naranja", "Pomelo"],
      },
      "pitusa-surtida-choco-vaini-frutilla-limon-u": {
        nombre: "Pitusa",
        sabores: ["Chocolate", "Vainilla", "Frutilla", "Limón", "Merengue", "Mousse"],
      },
      "delicia-de-la-nona-rellenas-vani-choco-fruti-180gr-u": {
        nombre: "Delicias de la Nonna Rellenas 180GR",
        sabores: ["Vainilla", "Chocolate", "Frutilla"],
      },
      "mana-rellenas-152gr-u": {
        nombre: "Mana Rellenas 152GR",
        sabores: ["Chocolate", "Vainilla", "Frutilla", "Limón"],
      },
    },
    ocultar: [
      "agua-sab-1-5-naranja-sierra-de-los-padres-pack-x6",
      "agua-sab-1-5-pomelo-sierra-de-los-padres-pack-x6",
      "agua-sab-1-5-pom-c-gas-sp-citrus-c-gas-pack-x6",
      "agua-tonica-1-5lt-sierra-de-los-padres-u",
      "agua-sab-500ml-naranja-s-los-padres-pack-x12",
      "agua-sab-500ml-pomelo-s-los-padres-pack-x12",
    ],
  };
})(typeof window !== "undefined" ? window : globalThis);
