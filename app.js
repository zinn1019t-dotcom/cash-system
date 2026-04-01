const DB_NAME = "offline-pos-db";

const DB_VERSION = 1;

const STORE_PRODUCTS = "products";

const STORE_SALES = "sales";

let db;

let cart = [];

let deferredPrompt = null;

const els = {

  products: document.getElementById("products"),

  cart: document.getElementById("cart"),

  history: document.getElementById("history"),

  totalAmount: document.getElementById("totalAmount"),

  receivedAmount: document.getElementById("receivedAmount"),

  changeAmount: document.getElementById("changeAmount"),

  productForm: document.getElementById("productForm"),

  productName: document.getElementById("productName"),

  productPrice: document.getElementById("productPrice"),

  loadSampleBtn: document.getElementById("loadSampleBtn"),

  clearCartBtn: document.getElementById("clearCartBtn"),

  checkoutBtn: document.getElementById("checkoutBtn"),

  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),

  exportBtn: document.getElementById("exportBtn"),

  installBtn: document.getElementById("installBtn"),

  productTpl: document.getElementById("productCardTemplate"),

  cartTpl: document.getElementById("cartItemTemplate"),

  historyTpl: document.getElementById("historyItemTemplate"),

};

document.addEventListener("DOMContentLoaded", init);

async function init() {

  db = await openDB();

  bindEvents();

  await renderProducts();

  await renderHistory();

  renderCart();

  registerSW();

}

function bindEvents() {

  els.productForm?.addEventListener("submit", onAddProduct);

  els.loadSampleBtn?.addEventListener("click", loadSampleProducts);

  els.clearCartBtn?.addEventListener("click", clearCart);

  els.checkoutBtn?.addEventListener("click", checkout);

  els.receivedAmount?.addEventListener("input", renderCart);

  els.refreshHistoryBtn?.addEventListener("click", renderHistory);

  els.exportBtn?.addEventListener("click", exportCSV);

  window.addEventListener("beforeinstallprompt", (e) => {

    e.preventDefault();

    deferredPrompt = e;

    if (els.installBtn) els.installBtn.hidden = false;

  });

  els.installBtn?.addEventListener("click", async () => {

    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    await deferredPrompt.userChoice;

    deferredPrompt = null;

    els.installBtn.hidden = true;

  });

}

function openDB() {

  return new Promise((resolve, reject) => {

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {

      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {

        const productStore = db.createObjectStore(STORE_PRODUCTS, {

          keyPath: "id"

        });

        productStore.createIndex("name", "name", { unique: false });

      }

      if (!db.objectStoreNames.contains(STORE_SALES)) {

        const salesStore = db.createObjectStore(STORE_SALES, {

          keyPath: "id"

        });

        salesStore.createIndex("createdAt", "createdAt", { unique: false });

      }

    };

    req.onsuccess = () => resolve(req.result);

    req.onerror = () => reject(req.error);

  });

}

function tx(storeName, mode = "readonly") {

  return db.transaction(storeName, mode).objectStore(storeName);

}

function requestToPromise(req) {

  return new Promise((resolve, reject) => {

    req.onsuccess = () => resolve(req.result);

    req.onerror = () => reject(req.error);

  });

}

async function getAll(storeName) {

  return requestToPromise(tx(storeName).getAll());

}

async function put(storeName, value) {

  return requestToPromise(tx(storeName, "readwrite").put(value));

}

async function deleteById(storeName, id) {

  return requestToPromise(tx(storeName, "readwrite").delete(id));

}

function formatYen(value) {

  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;

}

function createId(prefix = "id") {

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

}

async function onAddProduct(e) {

  e.preventDefault();

  const name = els.productName.value.trim();

  const price = Number(els.productPrice.value);

  if (!name || Number.isNaN(price) || price < 0) {

    alert("商品名と価格を正しく入力してください。");

    return;

  }

  await put(STORE_PRODUCTS, {

    id: createId("prd"),

    name,

    price

  });

  els.productForm.reset();

  await renderProducts();

}

async function loadSampleProducts() {

  const products = await getAll(STORE_PRODUCTS);

  if (products.length > 0) {

    const ok = confirm("既存の商品があります。サンプルを追加しますか？");

    if (!ok) return;

  }

  const samples = [

    { name: "ジュース", price: 150 },

    { name: "お茶", price: 120 },

    { name: "焼きそば", price: 400 },

    { name: "フランクフルト", price: 250 },

    { name: "かき氷", price: 300 },

    { name: "ポップコーン", price: 200 }

  ];

  for (const p of samples) {

    await put(STORE_PRODUCTS, {

      id: createId("prd"),

      name: p.name,

      price: p.price

    });

  }

  await renderProducts();

}

async function renderProducts() {

  if (!els.products) return;

  const products = await getAll(STORE_PRODUCTS);

  els.products.innerHTML = "";

  if (products.length === 0) {

    els.products.innerHTML = `
<div class="empty">

        まだ商品は登録されていません。<br>

        上のフォームから後で登録できます。
</div>

    `;

    return;

  }

  products.sort((a, b) => a.name.localeCompare(b.name, "ja"));

  for (const product of products) {

    const node = els.productTpl.content.firstElementChild.cloneNode(true);

    node.querySelector(".product-name").textContent = product.name;

    node.querySelector(".product-price").textContent = formatYen(product.price);

    node.addEventListener("click", () => addToCart(product));

    els.products.appendChild(node);

  }

}

function addToCart(product) {

  const existing = cart.find((item) => item.id === product.id);

  if (existing) {

    existing.qty += 1;

  } else {

    cart.push({

      id: product.id,

      name: product.name,

      price: Number(product.price),

      qty: 1

    });

  }

  renderCart();

}

function clearCart() {

  cart = [];

  if (els.receivedAmount) els.receivedAmount.value = "";

  renderCart();

}

function renderCart() {

  if (!els.cart) return;

  els.cart.innerHTML = "";

  if (cart.length === 0) {

    els.cart.innerHTML = `<div class="empty">カートは空です</div>`;

  } else {

    for (const item of cart) {

      const node = els.cartTpl.content.firstElementChild.cloneNode(true);

      node.querySelector(".cart-name").textContent = item.name;

      node.querySelector(".cart-sub").textContent =

        `${formatYen(item.price)} × ${item.qty} = ${formatYen(item.price * item.qty)}`;

      node.querySelector(".cart-qty").textContent = item.qty;

      node.querySelector(".qty-minus").addEventListener("click", () => {

        item.qty -= 1;

        if (item.qty <= 0) {

          cart = cart.filter((x) => x.id !== item.id);

        }

        renderCart();

      });

      node.querySelector(".qty-plus").addEventListener("click", () => {

        item.qty += 1;

        renderCart();

      });

      node.querySelector(".remove-btn").addEventListener("click", () => {

        cart = cart.filter((x) => x.id !== item.id);

        renderCart();

      });

      els.cart.appendChild(node);

    }

  }

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const received = Number(els.receivedAmount?.value || 0);

  const change = Math.max(0, received - total);

  if (els.totalAmount) els.totalAmount.textContent = formatYen(total);

  if (els.changeAmount) els.changeAmount.textContent = formatYen(change);

}

async function checkout() {

  if (cart.length === 0) {

    alert("カートが空です。");

    return;

  }

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const received = Number(els.receivedAmount?.value || 0);

  if (received < total) {

    alert("預かり金が不足しています。");

    return;

  }

  const sale = {

    id: createId("sale"),

    createdAt: new Date().toISOString(),

    total,

    received,

    change: received - total,

    items: cart.map((item) => ({

      productId: item.id,

      name: item.name,

      price: item.price,

      qty: item.qty,

      lineTotal: item.price * item.qty

    }))

  };

  await put(STORE_SALES, sale);

  alert(`会計を保存しました。\n合計: ${formatYen(total)}\nおつり: ${formatYen(sale.change)}`);

  clearCart();

  await renderHistory();

}

async function renderHistory() {

  if (!els.history) return;

  const sales = await getAll(STORE_SALES);

  els.history.innerHTML = "";

  if (sales.length === 0) {

    els.history.innerHTML = `<div class="empty">履歴はありません</div>`;

    return;

  }

  sales.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  for (const sale of sales) {

    const node = els.historyTpl.content.firstElementChild.cloneNode(true);

    const date = new Date(sale.createdAt);

    node.querySelector(".history-id").textContent = sale.id;

    node.querySelector(".history-time").textContent = date.toLocaleString("ja-JP");

    node.querySelector(".history-body").textContent = sale.items

      .map((item) => `${item.name} × ${item.qty} (${formatYen(item.lineTotal)})`)

      .join("\n");

    node.querySelector(".history-total").textContent =

      `合計 ${formatYen(sale.total)} / 預かり ${formatYen(sale.received)} / おつり ${formatYen(sale.change)}`;

    els.history.appendChild(node);

  }

}

async function exportCSV() {

  const sales = await getAll(STORE_SALES);

  if (sales.length === 0) {

    alert("出力する履歴がありません。");

    return;

  }

  sales.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const rows = [

    [

      "sale_id",

      "created_at",

      "product_name",

      "price",

      "qty",

      "line_total",

      "sale_total",

      "received",

      "change"

    ]

  ];

  for (const sale of sales) {

    for (const item of sale.items) {

      rows.push([

        sale.id,

        sale.createdAt,

        item.name,

        item.price,

        item.qty,

        item.lineTotal,

        sale.total,

        sale.received,

        sale.change

      ]);

    }

  }

  const csv = rows

    .map((row) => row.map(csvEscape).join(","))

    .join("\r\n");

  // Excel向けにUTF-8 BOMを付与

  const bom = "\uFEFF";

  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  const now = new Date();

  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  a.href = url;

  a.download = `sales_${ymd}.csv`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);

}
 

function csvEscape(value) {

  const str = String(value ?? "");

  if (/[",\r\n]/.test(str)) {

    return `"${str.replace(/"/g, '""')}"`;

  }

  return str;

}

async function registerSW() {

  if ("serviceWorker" in navigator) {

    try {

      await navigator.serviceWorker.register("./sw.js");

    } catch (err) {

      console.error("Service Worker registration failed:", err);

    }

  }

}
 
