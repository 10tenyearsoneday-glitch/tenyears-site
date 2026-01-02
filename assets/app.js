/* =========================
   TEN YEARS ONE DAY SPA
   - Static hosting (GitHub Pages / Netlify)
   - Data stored in localStorage (client-side)
   - NOTE: For real commerce/security, use a backend.
   ========================= */

const STORE_KEY = "tyod_store_v1";

const IG_URL = "https://www.instagram.com/tenyears_oneday?igsh=MW9hcjBnaTdjNzc0MQ%3D%3D&utm_source=qr";
const LINE_URL = "https://line.me/R/ti/p/@396kwrga";
const MAP_711 = "https://emap.pcsc.com.tw/emap.aspx";
const MAP_FAMILY = "https://www.family.com.tw/Marketing/zh/Map";
const API_URL = "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";
// 如果你的 Google Apps Script 需要 action 參數，模板會自動嘗試 ?action=get / ?action=set



/* ===== Optional Google Apps Script Sync (API_URL) =====
   需求：你的 GAS Web App 需回傳/接受 JSON
   - GET  :  { ...storeData }   或  { ok:true, data:{...} }
   - POST :  接收 { data: storeData } 或直接 storeData
   模板會依序嘗試：
     GET  API_URL?action=get  → API_URL
     POST API_URL?action=set  → API_URL
   失敗就退回 localStorage，不會讓網站壞掉。
*/
async function apiTryFetch(url){
  const r = await fetch(url, { method:"GET", cache:"no-store" });
  if(!r.ok) throw new Error("GET "+r.status);
  return await r.json();
}
async function apiGetStore(){
  if(!API_URL) return null;
  try{
    const j = await apiTryFetch(API_URL + (API_URL.includes("?")?"&":"?") + "action=get");
    return j?.data ?? j;
  }catch(e1){
    try{
      const j = await apiTryFetch(API_URL);
      return j?.data ?? j;
    }catch(e2){
      console.warn("[API] get failed, fallback to localStorage", e2);
      return null;
    }
  }
}
async function apiPostStore(data){
  if(!API_URL) return;
  const payload = { data };
  const postOnce = async (url)=> {
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    if(!r.ok) throw new Error("POST "+r.status);
    // 有些 GAS 不回 json，這裡保守處理
    const t = await r.text();
    try{ return JSON.parse(t); }catch{ return { ok:true, text:t }; }
  };
  try{
    return await postOnce(API_URL + (API_URL.includes("?")?"&":"?") + "action=set");
  }catch(e1){
    try{
      return await postOnce(API_URL);
    }catch(e2){
      console.warn("[API] set failed (ignored)", e2);
    }
  }
}
// debounce push
let _apiSaveTimer = null;
function apiScheduleSave(store){
  if(!API_URL) return;
  clearTimeout(_apiSaveTimer);
  _apiSaveTimer = setTimeout(()=>{ apiPostStore(store); }, 600);
}
/* ===== End Optional Sync ===== */

const routes = {
  "#home": { title: "關於我們（首頁）" },
  "#all": { title: "全系列🌸" },
  "#silver": { title: "純銀飾品✨" },
  "#promo": { title: "優惠活動🎁" },
  "#knowledge": { title: "飾品小知識💡" },
  "#faq": { title: "相關問題❗️" },
  "#cart": { title: "購物車" },
  "#checkout": { title: "結帳" },
  "#member": { title: "會員" },
  "#admin": { title: "管理者登入" },
  "#admin-panel": { title: "後台管理" }
};

function money(n){
  const v = Number(n||0);
  return "NT$ " + v.toLocaleString("zh-TW");
}

function nowISO(){
  return new Date().toISOString();
}

function loadStore(){
  const raw = localStorage.getItem(STORE_KEY);
  if(raw){
    try{ return JSON.parse(raw); }catch(e){}
  }
  return null;
}
function saveStore(store){
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  apiScheduleSave(store);
}

async function bootstrap(){
  let store = loadStore();
  // 先嘗試從 Google Apps Script 讀取（如果設定了 API_URL）
  const remote = await apiGetStore();
  if(remote && typeof remote === "object"){
    store = remote;
    saveStore(store);
  }
  if(!store){
    const [p, s] = await Promise.all([
      fetch("data/products.json").then(r=>r.json()),
      fetch("data/settings.json").then(r=>r.json())
    ]);
    store = {
      products: p,
      settings: s,
      cart: [],
      members: [], // {phone,password,name,birthMonth,birthDay,address,orders:[...],createdAt}
      currentMemberPhone: null,
      orders: [], // {id, memberPhone, items, totals, shipping, createdAt}
      admin: { loggedIn:false }
    };
    saveStore(store);
  }
  return store;
}

function getStore(){
  return loadStore() || { products:[], settings:{}, cart:[], members:[], orders:[], currentMemberPhone:null, admin:{loggedIn:false} };
}
function setStore(mutator){
  const store = getStore();
  mutator(store);
  saveStore(store);
  return store;
}

function currentMember(store){
  const phone = store.currentMemberPhone;
  if(!phone) return null;
  return store.members.find(m=>m.phone === phone) || null;
}

function isBirthdayMonth(store){
  const m = currentMember(store);
  if(!m) return false;
  const today = new Date();
  const mm = today.getMonth()+1;
  return Number(m.birthMonth) === mm;
}

function isFirstPurchase(store){
  const m = currentMember(store);
  if(!m) return false;
  const orders = store.orders.filter(o=>o.memberPhone === m.phone);
  return orders.length === 0;
}

function calcDiscounts(store, subtotal){
  const s = store.settings;
  let discount = 0;
  let discountLines = [];

  // first purchase 10% (requires login)
  if(store.currentMemberPhone && isFirstPurchase(store) && s.firstPurchaseDiscountRate){
    const d = subtotal * Number(s.firstPurchaseDiscountRate);
    discount += d;
    discountLines.push({ label: "首購優惠", amount: d });
  }

  // birthday month 15% (requires login)
  if(store.currentMemberPhone && isBirthdayMonth(store) && s.birthdayDiscountRate){
    const d = subtotal * Number(s.birthdayDiscountRate);
    discount += d;
    discountLines.push({ label: "當月壽星優惠", amount: d });
  }

  return { discount, discountLines };
}

function calcShipping(store, subtotal){
  const s = store.settings;
  const fee = Number(s.shippingFee ?? 0);
  const over = Number(s.freeShippingOver ?? 0);
  if(over > 0 && subtotal >= over) return { shipping: 0, free: true, threshold: over };
  return { shipping: fee, free: false, threshold: over };
}

function ensureRoute(){
  if(!location.hash) location.hash = "#home";
}

function setActiveNav(){
  const hash = location.hash || "#home";
  document.querySelectorAll(".pill").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("data-route") === hash);
  });
  const t = routes[hash]?.title || "十年一日";
  const el = document.getElementById("subheadText");
  if(el) el.textContent = t;
}

function el(html){
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHTML(str){
  return (str ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function renderHome(store){
  const s = store.settings;

  const wrap = document.createElement("div");

  wrap.appendChild(el(`
    <section class="hero">
      <div class="centerTitle">
        <div class="big">十年一日</div>
        <div class="sub">時光淬鍊 · 破碎中尋覓永恆<br/>每一件飾品 都是時間的詩篇</div>
      </div>

      <div class="announce" style="margin-top:14px;">
        <div class="badge">公告</div>
        <div class="text" id="announceTopText">${escapeHTML(s.announcementTop || "")}</div>
      </div>

      <div class="grid2">
        <div class="card pad">
          <h2>歡迎來到 十年一日</h2>
          <div class="canva-italic">TEN YEARS ONE DAY</div>
          <div class="canva-italic" style="margin-top:6px;">Every piece tells a story.</div>
          <div class="hr-dash"></div>
          <div class="prose">
            承載著十年以上的友情，<br/>
            繼續延續下去的動力。<br/><br/>
            每一件飾品，<br/>
            都是時間累積的溫柔。<br/><br/>
            <b>謝謝你，把重要的一天交給十年一日 ✨</b>
          </div>

          <div class="announce" style="margin-top:14px;">
            <div class="badge">公告</div>
            <div class="text" id="announceHomeText">${escapeHTML(s.announcementHome || "")}</div>
          </div>
        </div>

        <div class="card pad">
          <h2>關於我們</h2>
          <div class="smallMuted">十年一日</div>
          <div class="smallMuted">時光淬鍊 · 破碎中尋覓永恆</div>
          <div class="smallMuted">每一件飾品 都是時間的詩篇</div>
          <div class="hr-dash"></div>
          <div class="smallMuted">這裡可以把「品牌故事」放在這裡。</div>
          <div class="smallMuted" style="margin-top:10px;">想更新內容？管理者可在後台改公告、優惠、FAQ、商品與免運門檻。</div>
        </div>
      </div>
    </section>
  `));

  return wrap;
}

function filterProducts(store, opts){
  let list = store.products.slice();

  if(opts.onlySilver) list = list.filter(p=>!!p.isSilver);

  if(opts.collection === "allSeries"){
    // no-op, all
  }

  if(opts.category && opts.category !== "全部"){
    list = list.filter(p=>p.category === opts.category);
  }

  if(opts.q){
    const q = opts.q.toLowerCase();
    list = list.filter(p=>{
      return (p.name||"").toLowerCase().includes(q) ||
             (p.desc||"").toLowerCase().includes(q) ||
             (p.category||"").toLowerCase().includes(q) ||
             (p.collection||"").toLowerCase().includes(q);
    });
  }

  return list;
}

function productCard(store, p){
  const variantOptions = (p.variants && p.variants.length) ? p.variants : ["單一款式"];
  const img = (p.images && p.images[0]) ? p.images[0] : "";

  const node = el(`
    <div class="pCard">
      <img class="pImg" src="${escapeHTML(img)}" alt="${escapeHTML(p.name)}">
      <div class="pBody">
        <div class="pName">${escapeHTML(p.name)}</div>
        <div class="pMeta">
          <div>${escapeHTML(p.category || "")} · ${escapeHTML(p.status || "")}</div>
          <div class="price">${money(p.price)}</div>
        </div>
        <div class="pDesc">${escapeHTML(p.desc || "")}</div>

        <div class="pActions">
          <div>
            <select class="select" aria-label="款式">
              ${variantOptions.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("")}
            </select>
            <div style="height:8px"></div>
            <input class="qty" type="number" min="1" value="1" aria-label="數量">
          </div>
          <button class="btn">加入</button>
        </div>

        <div style="height:10px"></div>
        <button class="btn secondary" style="width:100%;">查看圖片 / 介紹</button>
      </div>
    </div>
  `);

  const imgEl = node.querySelector(".pImg");
  const viewBtn = node.querySelector(".btn.secondary");
  function openModal(){
    openImageModal(p);
  }
  imgEl.addEventListener("click", openModal);
  viewBtn.addEventListener("click", openModal);

  const addBtn = node.querySelector(".btn");
  addBtn.addEventListener("click", ()=>{
    const variant = node.querySelector("select").value;
    const qty = Math.max(1, Number(node.querySelector("input").value||1));
    addToCart(p.id, variant, qty);
    toast("已加入購物車");
    updateCartBadge();
  });

  return node;
}

function renderProductPage(store, mode){
  const onlySilver = mode === "silver";
  const pageTitle = onlySilver ? "純銀飾品✨" : "全系列🌸";
  const categories = ["全部","項鍊","手鏈","耳環","戒指"];

  let active = "全部";

  const wrap = document.createElement("div");
  wrap.appendChild(el(`
    <section class="card pad">
      <h2>${pageTitle}</h2>
      <div class="smallMuted">可自行新增商品品項（管理者後台）。每個商品可填：名稱、狀態、分類、金額、款式（可多行）、圖片網址（可多張）。</div>
      <div class="productFilters" id="filters"></div>
      <div class="products" id="plist"></div>
    </section>
  `));

  const filters = wrap.querySelector("#filters");
  const plist = wrap.querySelector("#plist");

  function paint(){
    filters.innerHTML = "";
    categories.forEach(c=>{
      const b = el(`<button class="chip ${c===active?"active":""}">${c}</button>`);
      b.addEventListener("click", ()=>{
        active = c;
        paint();
      });
      filters.appendChild(b);
    });

    plist.innerHTML = "";
    const list = filterProducts(store, { onlySilver, category: active });
    if(list.length === 0){
      plist.appendChild(el(`<div class="smallMuted">目前沒有符合的商品。</div>`));
      return;
    }
    list.forEach(p=> plist.appendChild(productCard(store, p)));
  }
  paint();

  return wrap;
}

function renderPromo(store){
  const s = store.settings;
  const wrap = document.createElement("div");

  const toneMap = {
    yellow: "",
    blue: "blue",
    pink: "pink",
    purple: "purple"
  };

  const itemsHTML = (s.promoItems || []).map(it=>{
    const cls = toneMap[it.tone] || "";
    return `
      <div class="promoBox ${cls}">
        <div style="font-weight:600;letter-spacing:.06em">${escapeHTML(it.title)}</div>
        <div class="smallMuted" style="margin-top:6px">${escapeHTML(it.body)}</div>
      </div>
    `;
  }).join("");

  wrap.appendChild(el(`
    <section class="card pad">
      <h2>優惠活動🎁</h2>
      <div class="smallMuted">內容可在後台隨時修改、增加。</div>
      <div style="height:12px"></div>
      <div style="display:grid;gap:12px;">
        ${itemsHTML}
      </div>
    </section>
  `));
  return wrap;
}

function renderKnowledge(store){
  const s = store.settings;
  const wrap = document.createElement("div");
  const list = s.knowledge || [];
  wrap.appendChild(el(`
    <section class="card pad">
      <h2>飾品小知識💡</h2>
      <div class="smallMuted">可自行增加說明框、標題與內容（後台）。</div>
      <div style="height:12px"></div>
      <div style="display:grid;gap:12px" id="klist"></div>
    </section>
  `));
  const klist = wrap.querySelector("#klist");
  list.forEach(item=>{
    klist.appendChild(el(`
      <div class="promoBox">
        <div style="font-weight:600;letter-spacing:.06em">${escapeHTML(item.title)}</div>
        <div class="smallMuted" style="margin-top:6px">${escapeHTML(item.body)}</div>
      </div>
    `));
  });
  return wrap;
}

function renderFAQ(store){
  const s = store.settings;
  const wrap = document.createElement("div");
  wrap.appendChild(el(`
    <section class="card pad">
      <h2>相關問題❗️</h2>
      <div class="noticeYellow">${escapeHTML(s.faqWarning || "")}</div>
      <div style="height:10px"></div>
      <div class="noticeRed">${escapeHTML(s.faqNotice || "")}</div>
      <div style="height:14px"></div>
      <div style="display:grid;gap:12px" id="faqs"></div>
    </section>
  `));
  const box = wrap.querySelector("#faqs");
  (s.faqs || []).forEach(f=>{
    box.appendChild(el(`
      <div class="promoBox">
        <div style="font-weight:600;letter-spacing:.06em">${escapeHTML(f.q)}</div>
        <div class="smallMuted" style="margin-top:6px">${escapeHTML(f.a)}</div>
      </div>
    `));
  });
  return wrap;
}

function cartCount(store){
  return (store.cart || []).reduce((sum,i)=>sum + Number(i.qty||0), 0);
}

function updateCartBadge(){
  const store = getStore();
  const n = cartCount(store);
  const btn = document.getElementById("btnCart");
  if(!btn) return;
  btn.setAttribute("data-count", String(n));
  btn.style.position = "relative";
  let badge = btn.querySelector(".cartBadge");
  if(!badge){
    badge = document.createElement("span");
    badge.className = "cartBadge";
    badge.style.cssText = `
      position:absolute; right:-4px; top:-4px;
      background: rgba(47,59,51,.86);
      color: rgba(255,255,255,.95);
      border-radius: 999px;
      font-size: 11px;
      padding: 3px 7px;
      border: 1px solid rgba(255,255,255,.35);
      display: none;
    `;
    btn.appendChild(badge);
  }
  if(n>0){
    badge.textContent = n;
    badge.style.display = "block";
  }else{
    badge.style.display = "none";
  }
}

function addToCart(productId, variant, qty){
  setStore(store=>{
    const line = store.cart.find(i=>i.productId===productId && i.variant===variant);
    if(line) line.qty += qty;
    else store.cart.push({ productId, variant, qty });
  });
}

function removeFromCart(productId, variant){
  setStore(store=>{
    store.cart = store.cart.filter(i=> !(i.productId===productId && i.variant===variant));
  });
}

function renderCart(store){
  const wrap = document.createElement("div");
  const items = store.cart || [];

  const rows = items.map(i=>{
    const p = store.products.find(x=>x.id===i.productId);
    if(!p) return null;
    const line = Number(p.price||0) * Number(i.qty||0);
    return { ...i, p, line };
  }).filter(Boolean);

  const subtotal = rows.reduce((s,r)=>s+r.line,0);

  wrap.appendChild(el(`
    <section class="card pad">
      <h2>購物車</h2>
      <div class="smallMuted">你可以查看客人選購了什麼，並前往結帳或繼續購物。</div>
      <div style="height:14px"></div>
      <div id="cartBody"></div>
    </section>
  `));
  const cartBody = wrap.querySelector("#cartBody");

  if(rows.length === 0){
    cartBody.appendChild(el(`
      <div class="smallMuted">購物車目前是空的。你可以到「全系列🌸」挑選商品。</div>
    `));
    cartBody.appendChild(el(`<div style="height:12px"></div>`));
    cartBody.appendChild(el(`<a class="btn" href="#all">繼續購物</a>`));
    return wrap;
  }

  const table = el(`
    <table class="table" aria-label="購物車清單">
      <thead>
        <tr><th>商品</th><th>款式</th><th>數量</th><th>小計</th><th></th></tr>
      </thead>
      <tbody></tbody>
    </table>
  `);

  const tbody = table.querySelector("tbody");
  rows.forEach(r=>{
    const tr = el(`
      <tr>
        <td>${escapeHTML(r.p.name)}</td>
        <td>${escapeHTML(r.variant)}</td>
        <td>
          <input class="qty" style="max-width:88px" type="number" min="1" value="${Number(r.qty)}">
        </td>
        <td>${money(r.line)}</td>
        <td><button class="btn secondary">刪除</button></td>
      </tr>
    `);
    const qtyInput = tr.querySelector("input");
    qtyInput.addEventListener("change", ()=>{
      const v = Math.max(1, Number(qtyInput.value||1));
      setStore(store=>{
        const line = store.cart.find(i=>i.productId===r.productId && i.variant===r.variant);
        if(line) line.qty = v;
      });
      render();
      updateCartBadge();
    });
    tr.querySelector("button").addEventListener("click", ()=>{
      removeFromCart(r.productId, r.variant);
      render();
      updateCartBadge();
    });
    tbody.appendChild(tr);
  });

  cartBody.appendChild(table);

  const { discount, discountLines } = calcDiscounts(store, subtotal);
  const { shipping, free, threshold } = calcShipping(store, subtotal);
  const total = Math.max(0, subtotal - discount + shipping);

  cartBody.appendChild(el(`<div style="height:14px"></div>`));
  const summary = el(`
    <div class="promoBox">
      <div class="pMeta"><div>商品小計</div><div class="price">${money(subtotal)}</div></div>
      <div id="discountLines"></div>
      <div class="pMeta" style="margin-top:8px"><div>運費</div><div class="price">${shipping===0? "免運" : money(shipping)}</div></div>
      ${threshold>0 ? `<div class="smallMuted" style="margin-top:6px">滿 ${money(threshold)} 免運（門檻可在後台調整）</div>` : ""}
      <div class="hr-dash"></div>
      <div class="pMeta"><div style="font-weight:600">總計</div><div class="price">${money(total)}</div></div>
      <div style="height:12px"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" href="#checkout">前往結帳</a>
        <a class="btn secondary" href="#all">繼續購物</a>
        <a class="btn secondary" href="#member">登入/會員</a>
      </div>
    </div>
  `);

  const dBox = summary.querySelector("#discountLines");
  if(discountLines.length){
    discountLines.forEach(d=>{
      dBox.appendChild(el(`<div class="pMeta" style="margin-top:8px"><div>${escapeHTML(d.label)}</div><div class="price">- ${money(d.amount)}</div></div>`));
    });
  }else{
    dBox.appendChild(el(`<div class="smallMuted" style="margin-top:8px">登入會員可享首購/壽星折扣（若符合）。</div>`));
  }

  cartBody.appendChild(summary);
  return wrap;
}

function renderCheckout(store){
  const wrap = document.createElement("div");
  const items = store.cart || [];
  const rows = items.map(i=>{
    const p = store.products.find(x=>x.id===i.productId);
    if(!p) return null;
    const line = Number(p.price||0) * Number(i.qty||0);
    return { ...i, p, line };
  }).filter(Boolean);

  if(rows.length === 0){
    wrap.appendChild(el(`
      <section class="card pad">
        <h2>結帳</h2>
        <div class="smallMuted">購物車是空的，請先挑選商品。</div>
        <div style="height:12px"></div>
        <a class="btn" href="#all">前往全系列</a>
      </section>
    `));
    return wrap;
  }

  const subtotal = rows.reduce((s,r)=>s+r.line,0);
  const { discount, discountLines } = calcDiscounts(store, subtotal);
  const { shipping } = calcShipping(store, subtotal);
  const total = Math.max(0, subtotal - discount + shipping);

  const member = currentMember(store);

  wrap.appendChild(el(`
    <section class="card pad">
      <h2>結帳系統</h2>
      <div class="smallMuted">需登入會員才可下單（手機號碼 + 密碼）。結帳可選 7-11、全家、宅配。</div>
      <div style="height:14px"></div>

      <div id="mustLogin" class="noticeYellow" style="display:none;">
        目前尚未登入。請先到 <a href="#member" style="text-decoration:underline;">會員頁面</a> 登入/註冊。
      </div>

      <div id="checkoutForm" style="display:none;">
        <div class="grid2">
          <div class="promoBox">
            <div style="font-weight:600;letter-spacing:.06em">收件資料</div>
            <div style="height:10px"></div>
            <div class="smallMuted">姓名（當月壽星名字會顯示 🎂）</div>
            <input class="input" id="cName" placeholder="姓名" />
            <div style="height:10px"></div>
            <div class="smallMuted">電話</div>
            <input class="input" id="cPhone" placeholder="手機號碼" />
            <div style="height:10px"></div>
            <div class="smallMuted">配送地址</div>
            <input class="input" id="cAddr" placeholder="地址" />
            <div style="height:10px"></div>
            <div class="smallMuted">配送方式</div>
            <select class="select" id="shipMethod">
              <option value="711">7-11 取貨</option>
              <option value="family">全家 取貨</option>
              <option value="home">宅配到府</option>
            </select>
            <div style="height:10px"></div>
            <div class="smallMuted">門市查詢</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <a class="btn secondary" href="${MAP_711}" target="_blank" rel="noopener">7-11 門市查詢</a>
              <a class="btn secondary" href="${MAP_FAMILY}" target="_blank" rel="noopener">全家 門市查詢</a>
            </div>
          </div>

          <div class="promoBox">
            <div style="font-weight:600;letter-spacing:.06em">訂單明細</div>
            <div style="height:10px"></div>
            <div id="orderLines"></div>
            <div class="hr-dash"></div>
            <div class="pMeta"><div>小計</div><div class="price">${money(subtotal)}</div></div>
            <div id="disc"></div>
            <div class="pMeta" style="margin-top:8px"><div>運費</div><div class="price">${shipping===0? "免運" : money(shipping)}</div></div>
            <div class="hr-dash"></div>
            <div class="pMeta"><div style="font-weight:600">總計</div><div class="price">${money(total)}</div></div>
            <div style="height:12px"></div>
            <button class="btn" id="placeOrder" style="width:100%;">確認下單</button>
            <div style="height:10px"></div>
            <div class="smallMuted">提示：本模板為「靜態前端示範」。正式上線建議接後端/金流。</div>
          </div>
        </div>
      </div>

    </section>
  `));

  const mustLogin = wrap.querySelector("#mustLogin");
  const form = wrap.querySelector("#checkoutForm");

  if(!member){
    mustLogin.style.display = "block";
    return wrap;
  }
  form.style.display = "block";

  const orderLines = wrap.querySelector("#orderLines");
  rows.forEach(r=>{
    orderLines.appendChild(el(`
      <div class="pMeta" style="margin-top:8px">
        <div>${escapeHTML(r.p.name)} <span class="smallMuted">(${escapeHTML(r.variant)} × ${Number(r.qty)})</span></div>
        <div class="price">${money(r.line)}</div>
      </div>
    `));
  });

  const disc = wrap.querySelector("#disc");
  if(discountLines.length){
    discountLines.forEach(d=>{
      disc.appendChild(el(`<div class="pMeta" style="margin-top:8px"><div>${escapeHTML(d.label)}</div><div class="price">- ${money(d.amount)}</div></div>`));
    });
  }else{
    disc.appendChild(el(`<div class="smallMuted" style="margin-top:8px">本次無折扣。</div>`));
  }

  const nameInput = wrap.querySelector("#cName");
  const phoneInput = wrap.querySelector("#cPhone");
  const addrInput = wrap.querySelector("#cAddr");

  const decoratedName = isBirthdayMonth(store) ? `${member.name} 🎂` : member.name;
  nameInput.value = decoratedName || "";
  phoneInput.value = member.phone || "";
  addrInput.value = member.address || "";

  wrap.querySelector("#placeOrder").addEventListener("click", ()=>{
    const shipMethod = wrap.querySelector("#shipMethod").value;
    const shippingLabel = shipMethod==="711" ? "7-11 取貨" : shipMethod==="family" ? "全家 取貨" : "宅配到府";

    // Persist updated profile (except birthday)
    setStore(st=>{
      const m = st.members.find(x=>x.phone===member.phone);
      if(m){
        m.name = (nameInput.value || member.name || "").replace(" 🎂","");
        m.address = addrInput.value || m.address;
      }
    });

    const orderId = "TYOD-" + Date.now().toString().slice(-8);

    setStore(st=>{
      const o = {
        id: orderId,
        memberPhone: member.phone,
        items: rows.map(r=>({
          productId: r.productId,
          name: r.p.name,
          variant: r.variant,
          qty: r.qty,
          price: r.p.price,
          line: r.line
        })),
        totals: {
          subtotal,
          discount,
          shipping,
          total
        },
        discountLines,
        shipping: {
          method: shipMethod,
          label: shippingLabel,
          receiver: {
            name: (nameInput.value || "").trim(),
            phone: (phoneInput.value || "").trim(),
            address: (addrInput.value || "").trim()
          }
        },
        createdAt: nowISO()
      };
      st.orders.unshift(o);
      // clear cart
      st.cart = [];
    });

    updateCartBadge();
    toast("已建立訂單：" + orderId);
    location.hash = "#member";
  });

  return wrap;
}

function renderMember(store){
  const wrap = document.createElement("div");
  const member = currentMember(store);

  if(!member){
    wrap.appendChild(el(`
      <section class="card pad">
        <h2>會員登入 / 註冊</h2>
        <div class="smallMuted">使用手機號碼與密碼登入。註冊後會自動轉跳資料頁面。</div>
        <div style="height:14px"></div>

        <div class="grid2">
          <div class="promoBox">
            <div style="font-weight:600;letter-spacing:.06em">登入</div>
            <div style="height:10px"></div>
            <div class="smallMuted">手機號碼</div>
            <input class="input" id="lPhone" placeholder="09xxxxxxxx" />
            <div style="height:10px"></div>
            <div class="smallMuted">密碼</div>
            <input class="input" id="lPass" type="password" placeholder="密碼" />
            <div style="height:12px"></div>
            <button class="btn" id="loginBtn" style="width:100%;">登入</button>
          </div>

          <div class="promoBox">
            <div style="font-weight:600;letter-spacing:.06em">註冊</div>
            <div style="height:10px"></div>
            <div class="smallMuted">姓名</div>
            <input class="input" id="rName" placeholder="姓名" />
            <div style="height:10px"></div>
            <div class="smallMuted">手機號碼</div>
            <input class="input" id="rPhone" placeholder="09xxxxxxxx" />
            <div style="height:10px"></div>
            <div class="smallMuted">密碼</div>
            <input class="input" id="rPass" type="password" placeholder="密碼" />
            <div style="height:10px"></div>
            <div class="smallMuted">生日（首次填寫）</div>
            <div style="display:flex;gap:10px">
              <select class="select" id="rBM" style="flex:1">
                ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join("")}
              </select>
              <select class="select" id="rBD" style="flex:1">
                ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`).join("")}
              </select>
            </div>
            <div style="height:10px"></div>
            <div class="smallMuted">地址</div>
            <input class="input" id="rAddr" placeholder="地址" />
            <div style="height:12px"></div>
            <button class="btn" id="regBtn" style="width:100%;">註冊</button>
          </div>
        </div>
      </section>
    `));

    wrap.querySelector("#loginBtn").addEventListener("click", ()=>{
      const phone = wrap.querySelector("#lPhone").value.trim();
      const pass = wrap.querySelector("#lPass").value;
      const m = store.members.find(x=>x.phone===phone && x.password===pass);
      if(!m){ toast("登入失敗：請確認手機號碼與密碼"); return; }
      setStore(st=>{ st.currentMemberPhone = phone; });
      toast("登入成功");
      render();
      updateCartBadge();
    });

    wrap.querySelector("#regBtn").addEventListener("click", ()=>{
      const name = wrap.querySelector("#rName").value.trim();
      const phone = wrap.querySelector("#rPhone").value.trim();
      const pass = wrap.querySelector("#rPass").value;
      const bm = wrap.querySelector("#rBM").value;
      const bd = wrap.querySelector("#rBD").value;
      const addr = wrap.querySelector("#rAddr").value.trim();

      if(!name || !phone || !pass){ toast("請填寫姓名、手機與密碼"); return; }
      if(store.members.some(x=>x.phone===phone)){ toast("此手機已註冊"); return; }

      setStore(st=>{
        st.members.push({
          phone, password: pass, name,
          birthMonth: Number(bm), birthDay: Number(bd),
          address: addr,
          createdAt: nowISO()
        });
        st.currentMemberPhone = phone;
      });
      toast("註冊成功");
      location.hash = "#member";
      render();
      updateCartBadge();
    });

    return wrap;
  }

  const birthdayTag = isBirthdayMonth(store) ? " 🎂" : "";

  const orders = store.orders.filter(o=>o.memberPhone===member.phone);

  wrap.appendChild(el(`
    <section class="card pad">
      <h2>會員資料${birthdayTag}</h2>
      <div class="smallMuted">可查看購買資訊、訂單編號與明細。除了生日外，其餘可修改。</div>
      <div style="height:14px"></div>

      <div class="grid2">
        <div class="promoBox">
          <div style="font-weight:600;letter-spacing:.06em">基本資料</div>
          <div style="height:10px"></div>

          <div class="smallMuted">姓名</div>
          <input class="input" id="mName" value="${escapeHTML(member.name)}" />
          <div style="height:10px"></div>

          <div class="smallMuted">手機</div>
          <input class="input" value="${escapeHTML(member.phone)}" disabled />
          <div style="height:10px"></div>

          <div class="smallMuted">生日（固定）</div>
          <input class="input" value="${member.birthMonth}月${member.birthDay}日" disabled />
          <div style="height:10px"></div>

          <div class="smallMuted">地址</div>
          <input class="input" id="mAddr" value="${escapeHTML(member.address || "")}" />
          <div style="height:12px"></div>

          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" id="saveProfile">儲存</button>
            <a class="btn secondary" href="#cart">查看購物車</a>
            <button class="btn secondary" id="logoutBtn">登出</button>
          </div>
        </div>

        <div class="promoBox">
          <div style="font-weight:600;letter-spacing:.06em">我的訂單（${orders.length}）</div>
          <div style="height:10px"></div>
          <div id="orders"></div>
        </div>
      </div>
    </section>
  `));

  wrap.querySelector("#saveProfile").addEventListener("click", ()=>{
    const nm = wrap.querySelector("#mName").value.trim();
    const ad = wrap.querySelector("#mAddr").value.trim();
    setStore(st=>{
      const m = st.members.find(x=>x.phone===member.phone);
      if(m){
        m.name = nm || m.name;
        m.address = ad;
      }
    });
    toast("已儲存");
    render();
  });

  wrap.querySelector("#logoutBtn").addEventListener("click", ()=>{
    setStore(st=>{ st.currentMemberPhone = null; });
    toast("已登出");
    render();
    updateCartBadge();
  });

  const box = wrap.querySelector("#orders");
  if(orders.length === 0){
    box.appendChild(el(`<div class="smallMuted">目前沒有訂單。完成結帳後會顯示在這裡。</div>`));
  }else{
    orders.slice(0,10).forEach(o=>{
      const dt = new Date(o.createdAt);
      const lines = o.items.map(it=>`${it.name} (${it.variant}) × ${it.qty}`).join("<br/>");
      box.appendChild(el(`
        <div class="promoBox" style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-weight:600">訂單編號：${escapeHTML(o.id)}</div>
            <div class="smallMuted">${dt.toLocaleString("zh-TW")}</div>
          </div>
          <div style="height:8px"></div>
          <div class="smallMuted">商品：</div>
          <div class="smallMuted" style="line-height:1.7">${lines}</div>
          <div style="height:8px"></div>
          <div class="smallMuted">配送：${escapeHTML(o.shipping.label)}｜地址：${escapeHTML(o.shipping.receiver.address || "")}</div>
          <div style="height:8px"></div>
          <div class="pMeta"><div>總額</div><div class="price">${money(o.totals.total)}</div></div>
        </div>
      `));
    });
  }

  return wrap;
}

/* =========================
   Admin (client-side)
   WARNING: Frontend-only admin is NOT secure.
   ========================= */
const ADMIN_USER = "tenyears_oneday";
const ADMIN_PASS = "09110321";

function renderAdminLogin(store){
  const wrap = document.createElement("div");
  wrap.appendChild(el(`
    <section class="card pad">
      <h2>管理者登入</h2>
      <div class="smallMuted">此為內建後台示範（僅前端 localStorage）。正式上線請改為後端驗證。</div>
      <div style="height:14px"></div>
      <div class="promoBox" style="max-width:520px;margin:0 auto;">
        <div class="smallMuted">帳號</div>
        <input class="input" id="aUser" placeholder="帳號" />
        <div style="height:10px"></div>
        <div class="smallMuted">密碼</div>
        <input class="input" id="aPass" type="password" placeholder="密碼" />
        <div style="height:12px"></div>
        <button class="btn" id="aLogin" style="width:100%;">登入</button>
      </div>
    </section>
  `));

  wrap.querySelector("#aLogin").addEventListener("click", ()=>{
    const u = wrap.querySelector("#aUser").value.trim();
    const p = wrap.querySelector("#aPass").value;
    if(u===ADMIN_USER && p===ADMIN_PASS){
      setStore(st=>{ st.admin.loggedIn = true; });
      toast("後台登入成功");
      location.hash = "#admin-panel";
    }else{
      toast("登入失敗");
    }
  });

  return wrap;
}

function renderAdminPanel(store){
  if(!store.admin.loggedIn){
    location.hash = "#admin";
    return document.createElement("div");
  }

  const wrap = document.createElement("div");
  const products = store.products.slice();
  const settings = store.settings;

  wrap.appendChild(el(`
    <section class="card pad">
      <h2>後台管理</h2>
      <div class="smallMuted">右下角可回到前台；此後台可新增/修改/刪除商品、調整免運門檻、折扣與公告。</div>
      <div style="height:12px"></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn secondary" id="logoutAdmin">登出</button>
        <a class="btn secondary" href="#home">回前台</a>
      </div>

      <div style="height:16px"></div>

      <div class="grid2">
        <div class="promoBox">
          <div style="font-weight:600;letter-spacing:.06em">站台設定（免運/折扣/公告）</div>
          <div style="height:10px"></div>

          <div class="smallMuted">運費（TWD）</div>
          <input class="input" id="sShip" type="number" min="0" value="${Number(settings.shippingFee||0)}" />
          <div style="height:10px"></div>

          <div class="smallMuted">滿額免運門檻（TWD）</div>
          <input class="input" id="sFree" type="number" min="0" value="${Number(settings.freeShippingOver||0)}" />
          <div style="height:10px"></div>

          <div class="smallMuted">首購折扣（例如 0.1 = 9 折）</div>
          <input class="input" id="sFirst" type="number" min="0" max="1" step="0.01" value="${Number(settings.firstPurchaseDiscountRate||0)}" />
          <div style="height:10px"></div>

          <div class="smallMuted">壽星折扣（例如 0.15 = 85 折）</div>
          <input class="input" id="sBirth" type="number" min="0" max="1" step="0.01" value="${Number(settings.birthdayDiscountRate||0)}" />
          <div style="height:10px"></div>

          <div class="smallMuted">首頁公告（上方）</div>
          <textarea class="input" id="sAnnTop" rows="2">${escapeHTML(settings.announcementTop||"")}</textarea>
          <div style="height:10px"></div>

          <div class="smallMuted">首頁公告（卡片內）</div>
          <textarea class="input" id="sAnnHome" rows="2">${escapeHTML(settings.announcementHome||"")}</textarea>

          <div style="height:12px"></div>
          <button class="btn" id="saveSettings" style="width:100%;">儲存設定</button>
        </div>

        <div class="promoBox">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
            <div style="font-weight:600;letter-spacing:.06em">商品管理</div>
            <button class="btn" id="newProduct">新增商品</button>
          </div>
          <div style="height:10px"></div>
          <div class="smallMuted">會員看不到新增按鈕；後台可刪除商品、修改商品。</div>
          <div style="height:10px"></div>

          <div style="max-height:460px;overflow:auto;border:1px solid rgba(47,59,51,.10);border-radius:14px;background:rgba(255,255,255,.45);">
            <table class="table">
              <thead>
                <tr><th>名稱</th><th>分類</th><th>金額</th><th>狀態</th><th></th></tr>
              </thead>
              <tbody id="pRows"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div style="height:16px"></div>

      <div class="promoBox">
        <div style="font-weight:600;letter-spacing:.06em">會員管理（訂單數量）</div>
        <div style="height:10px"></div>
        <div style="max-height:340px;overflow:auto;border:1px solid rgba(47,59,51,.10);border-radius:14px;background:rgba(255,255,255,.45);">
          <table class="table">
            <thead>
              <tr><th>手機</th><th>姓名</th><th>訂單數</th><th>建立時間</th></tr>
            </thead>
            <tbody id="mRows"></tbody>
          </table>
        </div>
      </div>

      <div style="height:16px"></div>

      <div class="promoBox">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div style="font-weight:600;letter-spacing:.06em">訂單管理</div>
          <div class="smallMuted">可刪除訂單（示範）</div>
        </div>
        <div style="height:10px"></div>
        <div style="max-height:420px;overflow:auto;border:1px solid rgba(47,59,51,.10);border-radius:14px;background:rgba(255,255,255,.45);">
          <table class="table">
            <thead>
              <tr><th>編號</th><th>會員</th><th>總額</th><th>時間</th><th></th></tr>
            </thead>
            <tbody id="oRows"></tbody>
          </table>
        </div>
      </div>

    </section>
  `));

  // Admin floating button (as requested)
  const floatBtn = el(`
    <a href="#admin-panel" class="iconBtn" style="position:fixed;right:18px;bottom:18px;width:auto;padding:0 14px;gap:10px;display:flex;">
      <span style="opacity:.85">後台管理</span>
    </a>
  `);
  document.body.appendChild(floatBtn);
  // remove on rerender
  wrap._cleanup = ()=> floatBtn.remove();

  wrap.querySelector("#logoutAdmin").addEventListener("click", ()=>{
    setStore(st=>{ st.admin.loggedIn=false; });
    toast("已登出後台");
    location.hash = "#home";
  });

  wrap.querySelector("#saveSettings").addEventListener("click", ()=>{
    const ship = Number(wrap.querySelector("#sShip").value||0);
    const free = Number(wrap.querySelector("#sFree").value||0);
    const first = Number(wrap.querySelector("#sFirst").value||0);
    const birth = Number(wrap.querySelector("#sBirth").value||0);
    const annTop = wrap.querySelector("#sAnnTop").value || "";
    const annHome = wrap.querySelector("#sAnnHome").value || "";
    setStore(st=>{
      st.settings.shippingFee = ship;
      st.settings.freeShippingOver = free;
      st.settings.firstPurchaseDiscountRate = first;
      st.settings.birthdayDiscountRate = birth;
      st.settings.announcementTop = annTop;
      st.settings.announcementHome = annHome;
    });
    toast("設定已儲存");
  });

  // Product table
  const pRows = wrap.querySelector("#pRows");
  function paintProducts(){
    const st = getStore();
    pRows.innerHTML = "";
    st.products.forEach(p=>{
      const tr = el(`
        <tr>
          <td>${escapeHTML(p.name)}</td>
          <td>${escapeHTML(p.category||"")}</td>
          <td>${money(p.price)}</td>
          <td>${escapeHTML(p.status||"")}</td>
          <td style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn secondary">修改</button>
            <button class="btn secondary">刪除</button>
          </td>
        </tr>
      `);
      const [editBtn, delBtn] = tr.querySelectorAll("button");
      editBtn.addEventListener("click", ()=> openProductEditor(p.id));
      delBtn.addEventListener("click", ()=>{
        if(!confirm("確定刪除商品？")) return;
        setStore(s=>{
          s.products = s.products.filter(x=>x.id!==p.id);
        });
        toast("已刪除");
        paintProducts();
      });
      pRows.appendChild(tr);
    });
  }
  paintProducts();

  wrap.querySelector("#newProduct").addEventListener("click", ()=> openProductEditor(null));

  // Members table
  const mRows = wrap.querySelector("#mRows");
  function paintMembers(){
    const st = getStore();
    mRows.innerHTML = "";
    st.members.forEach(m=>{
      const cnt = st.orders.filter(o=>o.memberPhone===m.phone).length;
      const tr = el(`
        <tr>
          <td>${escapeHTML(m.phone)}</td>
          <td>${escapeHTML(m.name)}</td>
          <td>${cnt}</td>
          <td>${new Date(m.createdAt).toLocaleString("zh-TW")}</td>
        </tr>
      `);
      mRows.appendChild(tr);
    });
  }
  paintMembers();

  // Orders table
  const oRows = wrap.querySelector("#oRows");
  function paintOrders(){
    const st = getStore();
    oRows.innerHTML = "";
    st.orders.forEach(o=>{
      const tr = el(`
        <tr>
          <td>${escapeHTML(o.id)}</td>
          <td>${escapeHTML(o.memberPhone)}</td>
          <td>${money(o.totals.total)}</td>
          <td>${new Date(o.createdAt).toLocaleString("zh-TW")}</td>
          <td><button class="btn secondary">刪除</button></td>
        </tr>
      `);
      tr.querySelector("button").addEventListener("click", ()=>{
        if(!confirm("確定刪除訂單？")) return;
        setStore(s=>{
          s.orders = s.orders.filter(x=>x.id!==o.id);
        });
        toast("已刪除訂單");
        paintOrders();
        paintMembers();
      });
      oRows.appendChild(tr);
    });
  }
  paintOrders();

  return wrap;
}

function openProductEditor(productId){
  const st = getStore();
  const isNew = !productId;
  const p = isNew ? {
    id: "p" + Math.random().toString(16).slice(2,8),
    name:"",
    status:"現貨",
    collection:"全系列",
    category:"項鍊",
    isSilver:false,
    price:0,
    variants:["單一款式"],
    images:[""],
    desc:"",
    sku:"",
    vendor:""
  } : (st.products.find(x=>x.id===productId) || null);

  if(!p){ toast("找不到商品"); return; }

  const overlay = document.createElement("div");
  overlay.className = "modalOverlay show";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="peTitle">
      <div class="modalHead">
        <h3 id="peTitle">${isNew ? "新增商品" : "修改商品"}</h3>
        <button class="closeX" aria-label="關閉">✕</button>
      </div>
      <div class="modalBody">
        <div class="grid2" style="grid-template-columns:1fr 1fr;">
          <div>
            <div class="smallMuted">商品名稱</div>
            <input class="input" id="peName" value="${escapeHTML(p.name)}">
            <div style="height:10px"></div>

            <div class="smallMuted">狀態</div>
            <input class="input" id="peStatus" value="${escapeHTML(p.status||"")}">
            <div style="height:10px"></div>

            <div class="smallMuted">分類（全部/項鍊/手鏈/耳環/戒指）</div>
            <input class="input" id="peCat" value="${escapeHTML(p.category||"")}">
            <div style="height:10px"></div>

            <div class="smallMuted">金額（TWD）</div>
            <input class="input" id="pePrice" type="number" min="0" value="${Number(p.price||0)}">
            <div style="height:10px"></div>

            <div class="smallMuted">是否純銀（true/false）</div>
            <select class="select" id="peSilver">
              <option value="false" ${p.isSilver? "" : "selected"}>false</option>
              <option value="true" ${p.isSilver? "selected" : ""}>true</option>
            </select>

          </div>

          <div>
            <div class="smallMuted">款式（每行一個）</div>
            <textarea class="input" id="peVar" rows="4">${escapeHTML((p.variants||[]).join("\n"))}</textarea>
            <div style="height:10px"></div>

            <div class="smallMuted">圖片網址（每行一個，可多張）</div>
            <textarea class="input" id="peImg" rows="4">${escapeHTML((p.images||[]).join("\n"))}</textarea>
            <div style="height:10px"></div>

            <div class="smallMuted">商品介紹</div>
            <textarea class="input" id="peDesc" rows="4">${escapeHTML(p.desc||"")}</textarea>
          </div>
        </div>

        <div class="hr-dash"></div>
        <div class="smallMuted">（只有管理員看得見）編碼 / 廠商</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input class="input" id="peSku" style="flex:1;min-width:220px" placeholder="編碼" value="${escapeHTML(p.sku||"")}">
          <input class="input" id="peVendor" style="flex:1;min-width:220px" placeholder="廠商" value="${escapeHTML(p.vendor||"")}">
        </div>

        <div style="height:12px"></div>
        <button class="btn" id="peSave" style="width:100%;">儲存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".closeX").addEventListener("click", ()=> overlay.remove());
  overlay.addEventListener("click", (e)=>{ if(e.target===overlay) overlay.remove(); });

  overlay.querySelector("#peSave").addEventListener("click", ()=>{
    const name = overlay.querySelector("#peName").value.trim();
    if(!name){ toast("請填商品名稱"); return; }

    const status = overlay.querySelector("#peStatus").value.trim();
    const category = overlay.querySelector("#peCat").value.trim();
    const price = Number(overlay.querySelector("#pePrice").value||0);
    const isSilver = overlay.querySelector("#peSilver").value === "true";
    const variants = overlay.querySelector("#peVar").value.split("\n").map(x=>x.trim()).filter(Boolean);
    const images = overlay.querySelector("#peImg").value.split("\n").map(x=>x.trim()).filter(Boolean);
    const desc = overlay.querySelector("#peDesc").value.trim();
    const sku = overlay.querySelector("#peSku").value.trim();
    const vendor = overlay.querySelector("#peVendor").value.trim();

    setStore(st=>{
      const obj = {
        ...p,
        name, status, category, price, isSilver,
        variants: variants.length? variants : ["單一款式"],
        images: images.length? images : [""],
        desc, sku, vendor
      };
      if(isNew){
        st.products.unshift(obj);
      }else{
        const idx = st.products.findIndex(x=>x.id===p.id);
        if(idx>=0) st.products[idx] = obj;
      }
    });

    toast("已儲存商品");
    overlay.remove();
    // refresh admin panel if on it
    if(location.hash==="#admin-panel") render();
  });
}

/* =========================
   Search + Image modal
   ========================= */
function openSearch(){
  const modal = document.getElementById("searchModal");
  modal.classList.add("show");
  const input = document.getElementById("searchInput");
  input.value = "";
  input.focus();

  const paint = ()=>{
    const st = getStore();
    const q = input.value.trim();
    const list = filterProducts(st, { q });
    const box = document.getElementById("searchResults");
    box.innerHTML = "";
    list.slice(0, 12).forEach(p=> box.appendChild(productCard(st,p)));
    if(q && list.length===0){
      box.appendChild(el(`<div class="smallMuted">找不到符合的商品。</div>`));
    }
  };
  input.oninput = paint;
  paint();
}
function closeSearch(){
  document.getElementById("searchModal").classList.remove("show");
}

function openImageModal(p){
  const modal = document.getElementById("imgModal");
  const body = document.getElementById("imgBody");
  const title = document.getElementById("imgTitle");
  title.textContent = p.name;

  const imgs = (p.images && p.images.length) ? p.images : [""];
  body.innerHTML = `
    <div class="grid2" style="grid-template-columns:1.2fr .8fr;">
      <div>
        ${imgs.map(u=>`<img src="${escapeHTML(u)}" alt="${escapeHTML(p.name)}" style="width:100%;border-radius:16px;border:1px solid rgba(47,59,51,.10);background:rgba(47,59,51,.06);margin-bottom:10px;object-fit:cover">`).join("")}
      </div>
      <div>
        <div class="promoBox">
          <div style="font-weight:600;letter-spacing:.06em">${escapeHTML(p.name)}</div>
          <div style="height:8px"></div>
          <div class="smallMuted">${escapeHTML(p.desc||"")}</div>
          <div style="height:10px"></div>
          <div class="pMeta"><div>${escapeHTML(p.category||"")} · ${escapeHTML(p.status||"")}</div><div class="price">${money(p.price)}</div></div>
          <div style="height:12px"></div>
          <a class="btn" href="#cart" onclick="(function(){ addToCart('${p.id}','${escapeHTML((p.variants&&p.variants[0])||"單一款式")} ',1); updateCartBadge(); toast('已加入購物車'); })(); return false;">快速加入</a>
        </div>
      </div>
    </div>
  `;
  modal.classList.add("show");
}
function closeImg(){
  document.getElementById("imgModal").classList.remove("show");
}

/* =========================
   Toast
   ========================= */
let toastTimer = null;
function toast(msg){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%);
      background: rgba(47,59,51,.90);
      color: rgba(255,255,255,.95);
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 13px;
      letter-spacing: .04em;
      z-index: 200;
      box-shadow: 0 18px 48px rgba(0,0,0,.22);
      opacity: 0;
      transition: opacity .18s ease;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.style.opacity="0"; }, 1600);
}

/* =========================
   Router render
   ========================= */
let currentCleanup = null;

function render(){
  const store = getStore();
  const app = document.getElementById("app");
  if(!app) return;

  // cleanup floating elements from previous route
  if(typeof currentCleanup === "function"){
    try{ currentCleanup(); }catch(e){}
  }
  currentCleanup = null;

  const hash = location.hash || "#home";
  setActiveNav();

  let view;
  switch(hash){
    case "#home": view = renderHome(store); break;
    case "#all": view = renderProductPage(store, "all"); break;
    case "#silver": view = renderProductPage(store, "silver"); break;
    case "#promo": view = renderPromo(store); break;
    case "#knowledge": view = renderKnowledge(store); break;
    case "#faq": view = renderFAQ(store); break;
    case "#cart": view = renderCart(store); break;
    case "#checkout": view = renderCheckout(store); break;
    case "#member": view = renderMember(store); break;
    case "#admin": view = renderAdminLogin(store); break;
    case "#admin-panel": view = renderAdminPanel(store); break;
    default: view = renderHome(store);
  }

  app.innerHTML = "";
  app.appendChild(view);

  // pick up cleanup from view if exists
  if(view && view._cleanup) currentCleanup = view._cleanup;

  updateCartBadge();
}

function wireUI(){
  document.getElementById("btnSearch").addEventListener("click", openSearch);
  document.getElementById("closeSearch").addEventListener("click", closeSearch);
  document.getElementById("searchModal").addEventListener("click", (e)=>{ if(e.target.id==="searchModal") closeSearch(); });

  document.getElementById("closeImg").addEventListener("click", closeImg);
  document.getElementById("imgModal").addEventListener("click", (e)=>{ if(e.target.id==="imgModal") closeImg(); });

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", render);
}

(async function main(){
  ensureRoute();
  await bootstrap();
  wireUI();
  render();
})();
