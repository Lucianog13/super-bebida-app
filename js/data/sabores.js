// Overlay de correcciones (2026-08-19, pedido de Lucho; ampliado 12/09/2026):
// productos que se venden con variedades + corrección de categorías. Este archivo
// sobrevive a la regeneración de products.js (parse_precios.py) porque se aplica
// encima del catálogo cargado (nube, caché o archivo local).
//
// - familias: id → nombre limpio + lista de sabores (un precio para todos).
//   Opcional: `precios: { "Sabor": 8000 }` para sabores con precio propio (el resto
//   usa el precio del producto), `activar: true` para reactivar un producto inactivo
//   en la nube, y `saboresLabel` para cambiar el texto del botón (ej. "Elegir fragancia").
// - ocultar: entradas del catálogo que quedan absorbidas por la familia (ej. las
//   aguas saborizadas repetidas). Se filtran de la vista de clientes.
// - categorias: id → categoría correcta (corrige errores de la base sin tocar Supabase).
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
        sabores: ["Agridulce", "Azucarada", "Clásica"],
      },
      "obleas-55grs-choco-vaini-frutilla-u": {
        nombre: "Obleas Tym 55grs",
        sabores: ["Chocolate", "Dulce de Leche", "Frutilla", "Ultra Cacao", "Vainilla", "Vainilla y Frutilla"],
      },
      "formis-55gr-frutiila-choco-dulce-d-leche-u": {
        nombre: "Formis 55GR",
        sabores: ["Chocolate", "Dulce de Leche", "Frutilla"],
      },
      "polvoritas-chocolate-vaini-fruti-choco-81gr-u": {
        nombre: "Polvoritas 81GR",
        sabores: ["Chocolate", "Frutilla", "Vainilla"],
      },
      "manaos-cola-nar-pom-lima-limon-citrus-manz-granadina-3lt-pac": {
        nombre: "Manaos 3L",
        sabores: ["Citrus", "Cola", "Granadina", "Lima", "Limón", "Manzana", "Naranja", "Pomelo"],
      },
      "saladix-caja-pack-x6": {
        nombre: "Saladix Caja",
        sabores: ["Calabresa", "Cheddar", "Dúo", "Jamón", "Pizza"],
      },
      "tira-saladix-pack-x6": {
        nombre: "Tira Saladix",
        sabores: ["Calabresa", "Cheddar", "Dúo", "Jamón", "Pizza"],
      },
      "planet-nar-pom-lima-sierra-de-los-padres-1-5lt-pack-x6": {
        nombre: "Planet 1,5L",
        sabores: ["Lima", "Naranja", "Pomelo"],
      },
      "agua-sab-1-5-manzana-sierra-de-los-padres-pack-x6": {
        nombre: "Agua Saborizada 1,5L",
        sabores: ["Citrus c/gas", "Manzana", "Naranja", "Pomelo", "Pomelo c/gas", "Pomelo Rosado", "Tónica"],
      },
      "agua-sab-500ml-manzana-s-los-padres-pack-x12": {
        nombre: "Agua Saborizada 500ML",
        sabores: ["Manzana", "Naranja", "Pomelo"],
      },
      "pitusa-surtida-choco-vaini-frutilla-limon-u": {
        nombre: "Pitusa",
        sabores: ["Chocolate", "Frutilla", "Limón", "Merengue", "Mousse", "Vainilla"],
      },
      "delicia-de-la-nona-rellenas-vani-choco-fruti-180gr-u": {
        nombre: "Delicias de la Nonna Rellenas 180GR",
        sabores: ["Chocolate", "Frutilla", "Vainilla"],
      },
      "mana-rellenas-152gr-u": {
        nombre: "Mana Rellenas 152GR",
        sabores: ["Chocolate", "Frutilla", "Limón", "Vainilla"],
      },
      // ── Familias nuevas (pedido de Tincho, 09/09/2026) ──
      "gomitas-yummy-botellita-frutilla-huevos-fritos-bananitas-osi": {
        nombre: "Gomitas Yummy",
        sabores: ["Bananitas", "Botellitas", "Frutilla", "Huevos Fritos", "Ositos"],
      },
      "gomitas-ositos-cerebrito-piecito-tiburon-pack-x12": {
        nombre: "Gomitas Ositos / Cerebritos / Piecitos / Tiburones",
        sabores: ["Cerebritos", "Ositos", "Piecitos", "Tiburones"],
        activar: true,
      },
      "levite-1-5-man-pera-pom-nar-pack-x6": {
        nombre: "Levite 1.5L",
        sabores: ["Manzana", "Naranja", "Pera", "Pomelo"],
      },
      "liq-para-lavar-ropa-ecovita-800ml-u": {
        nombre: "Suavizante para Ropa Ecovita 800ML",
        sabores: ["Épico", "Tradicional", "Único"],
        saboresLabel: "Elegir fragancia",
      },
      "alfajor-guaymayen-bco-negro-triple-pack-x24": {
        nombre: "Alfajor Guaymayen Triple x24",
        sabores: ["Blanco", "Fruta", "Negro"],
      },
      "clight-unid-pack-x20": {
        nombre: "Clight Unid",
        sabores: ["Ananá", "Limonada (Clásica)", "Limonada con Arándanos", "Limonada Maracuyá", "Limonada Rosa", "Mandarina", "Manzana Deliciosa", "Manzana Verde", "Naranja", "Naranja Dulce", "Naranja Durazno", "Naranja Mango", "Pera", "Pomelada Hibiscus", "Pomelo Amarillo", "Pomelo Rosado"],
      },
      "tang-x20unid-u": {
        nombre: "Tang X20UNID",
        sabores: ["Ananá", "Frutilla", "Galáctico", "Limonada Dulce", "Mandarina", "Manzana", "Multifruta", "Naranja", "Naranja Banana", "Naranja Dulce", "Naranja Mango", "Pera"],
      },
      "rinde-2-unid-pack-x10": {
        nombre: "Rinde 2 Unid",
        sabores: ["Ananá", "Durazno", "Frutilla", "Limón", "Manzana", "Mix Frutal", "Naranja", "Naranja Banana", "Naranja Mango", "Pera", "Pomelo Rosado"],
      },
      "liverpool-rojo-azul-verde-u": {
        nombre: "Liverpool",
        sabores: ["Azul", "Rojo", "Verde"],
      },
      "alfajor-mogui-bco-unidades-pack-x40": {
        nombre: "Alfajor Mogy x40 unid",
        sabores: ["Blanco", "Negro"],
      },
      "dr-lemon-1lt-berry-limon-vodka-mojito-u": {
        nombre: "Dr Lemon 1LT",
        sabores: ["Green Apple", "Limón", "Mojito", "Pomelo", "Red Berry", "Vodka"],
      },
      "vodka-sernova-berry-mtriv898": {
        nombre: "Vodka Sernova",
        sabores: ["Candy Glow", "Caribbean Blend", "Fresh Citrus", "Ice Pop", "Sernova Classic", "Sweet Apple Pear", "Tropical Passion", "Wild Berries"],
        precios: {
          "Sernova Classic": 7500,
          "Wild Berries": 8000,
          "Tropical Passion": 8000,
          "Sweet Apple Pear": 8000,
          "Caribbean Blend": 8000,
          "Fresh Citrus": 8000,
          "Candy Glow": 8000,
          "Ice Pop": 8000,
        },
      },
      "vodka-new-style-edicion-epecial-azul-u": {
        nombre: "Vodka New Style",
        sabores: ["Apricot", "Bubble Gum", "Citrus", "Frutos Rojos", "Lollipop", "Manzana Verde", "Maracuyá", "Melón", "Original", "Pineapple", "Raspberry", "Sandía"],
      },
      // ── Familias nuevas (pedido de Tincho, 12/09/2026) ──
      "power-500ml-manzana-rojo-azul-pack-x6": {
        nombre: "Power 500ML",
        sabores: ["Azul", "Manzana", "Rojo"],
      },
      "amarula-mtbp0obe": {
        nombre: "Amarula",
        sabores: ["Café Etíope", "Especias de Vainilla", "Frambuesa - Chocolate blanco - Baobab"],
      },
      "vodka-smirnoff-clasico-u": {
        nombre: "Vodka Smirnoff",
        sabores: ["Citrus", "Clásico", "Fresa", "Frutas Tropicales", "Manzana Verde", "Sandía"],
        precios: {
          "Clásico": 8300,
          "Citrus": 9000,
          "Fresa": 9000,
          "Frutas Tropicales": 9000,
          "Manzana Verde": 9000,
          "Sandía": 9000,
        },
      },
    },
    categorias: {
      "aceite-girasol-fraud-bidon-4-5lt-u": "almacen",
      "yerba-aguantadora-500gr-x-unidad-u": "almacen",
      "yerba-aguantadora-500grs-pack-x10": "almacen",
      "gall-agua-la-providencia-pack-x3": "galletitas",
      "gall-agua-la-providencia-pack-x5": "galletitas",
      "pepas-delicias-de-la-nonna-mtkbwlyf": "galletitas",
    },
    ocultar: [
      "agua-sab-1-5-naranja-sierra-de-los-padres-pack-x6",
      "agua-sab-1-5-pomelo-sierra-de-los-padres-pack-x6",
      "agua-sab-1-5-pom-c-gas-sp-citrus-c-gas-pack-x6",
      "agua-tonica-1-5lt-sierra-de-los-padres-u",
      "agua-sab-500ml-naranja-s-los-padres-pack-x12",
      "agua-sab-500ml-pomelo-s-los-padres-pack-x12",
      // unificaciones (pedido de Tincho, 09/09/2026)
      "alfajor-mogui-negro-unidades-pack-x40",
      "vodka-sernova-candy-mtrihs8g",
      "vodka-sernova-comun-mtriccsr",
      "vodka-sabor-new-style-citrus-u",
      "vodka-sabor-new-style-frutos-rojos-u",
      "vodka-sabor-new-style-manz-verde-u",
      "vodka-sabor-new-style-maracuya-u",
      "vodka-sabor-new-style-melon-u",
      "vodka-sabor-new-style-sandia-u",
      // unificación Smirnoff (pedido de Tincho, 12/09/2026)
      "vodka-smirnoff-citrus-u",
      "vodka-smirnoff-fresa-u",
      "vodka-smirnoff-frutos-tropicales-u",
      "vodka-smirnoff-green-apple-u",
      "vodka-smirnoff-watermelon-u",
    ],
  };
})(typeof window !== "undefined" ? window : globalThis);
