const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH", maximumFractionDigits: 0 }).format(Number(n) || 0);
let products = [], user = null, cart = JSON.parse(localStorage.getItem("stylehub-cart") || "[]");
let authMode = "login", adminTab = "products", editingProduct = null;
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const toast = msg => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); };
async function api(url, options={}) {
  const res = await fetch(url, options);
  const type = res.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || "Произошла ошибка.");
  return data;
}
const jsonOptions = data => ({ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) });
function showModal(html){$("#modalContent").innerHTML=html;$("#modal").classList.remove("hidden");}
function closeModal(){$("#modal").classList.add("hidden");}
function updateCartCount(){ $("#cartCount").textContent=cart.reduce((sum,x)=>sum+x.qty,0); localStorage.setItem("stylehub-cart",JSON.stringify(cart)); }
function cartAdd(p, size) {
  const key = `${p.id}-${size || ""}`, found = cart.find(x=>x.key===key);
  if(found) found.qty=Math.min(20,found.qty+1); else cart.push({key,id:p.id,qty:1,size:size||"",name:p.name,price:p.price,image:p.image});
  updateCartCount(); toast("Товар добавлен в корзину.");
}
function productCard(p) {
  return `<article class="product-card" data-id="${p.id}">
    <div class="product-image" data-open="${p.id}"><img src="${safe(p.image || "")}" alt="${safe(p.name)}" loading="lazy" onerror="this.src='https://placehold.co/600x800/f1f1f1/777?text=STYLEHUB'">
    ${p.featured ? '<span class="product-tag">ВЫБОР STYLEHUB</span>' : ''}<button class="quick-add" data-open="${p.id}">Подробнее ↗</button></div>
    <div class="product-meta"><div><p class="product-brand">${safe(p.brand || "STYLEHUB")}</p><p class="product-name">${safe(p.name)}</p><div class="product-color">${safe(p.color || "")}</div></div><div class="product-price">${money(p.price)}</div></div>
  </article>`;
}
function filters(){
  const params = new URLSearchParams();
  const fields = {q:$("#catalogSearch").value,category:$("#categoryFilter").value,brand:$("#brandFilter").value,size:$("#sizeFilter").value,color:$("#colorFilter").value,min:$("#minPrice").value,max:$("#maxPrice").value,sort:$("#sortFilter").value};
  Object.entries(fields).forEach(([k,v])=>{if(v)params.set(k,v)});
  return params.toString();
}
async function loadProducts(){
  try{
    products=await api("/api/products?"+filters());
    $("#products").innerHTML=products.length?products.map(productCard).join(""):'<div class="empty-state">Ничего не найдено. Попробуй изменить фильтры.</div>';
    $("#catalogCount").textContent=`(${products.length})`;
  }catch(e){$("#products").innerHTML=`<div class="empty-state">${safe(e.message)}</div>`}
}
async function loadOptions(){
  const o=await api("/api/options");
  const fill=(sel,items,label)=>{const el=$(sel);el.innerHTML=`<option value="">${label}</option>`+items.map(x=>`<option>${safe(x)}</option>`).join("")};
  fill("#brandFilter",o.brands,"Все бренды");fill("#colorFilter",o.colors,"Все цвета");fill("#sizeFilter",o.sizes,"Все размеры");
}
async function openProduct(id){
  try{
    const p=await api(`/api/products/${id}`);
    showModal(`<div class="product-detail"><img src="${safe(p.image)}" alt="${safe(p.name)}" onerror="this.src='https://placehold.co/600x800/f1f1f1/777?text=STYLEHUB'"><div><p class="eyebrow">${safe(p.brand||"STYLEHUB")}</p><h2>${safe(p.name)}</h2><div class="price">${money(p.price)}</div><p>${safe(p.description||"Описание скоро появится.")}</p><p><b>Цвет:</b> ${safe(p.color||"—")}</p><label>Размер<select id="detailSize">${p.sizes.split(",").filter(Boolean).map(s=>`<option>${safe(s.trim())}</option>`).join("") || '<option>ONE SIZE</option>'}</select></label><button class="button button-dark" id="detailAdd">Добавить в корзину ↗</button></div></div>`);
    $("#detailAdd").onclick=()=>{cartAdd(p,$("#detailSize").value);closeModal();};
  }catch(e){toast(e.message)}
}
function openCart(){
  const lines=cart.map(x=>`<div class="cart-line"><img src="${safe(x.image)}" alt=""><div><strong>${safe(x.name)}</strong><small>${money(x.price)} ${x.size?`· размер ${safe(x.size)}`:""}</small><div class="qty-controls"><button data-qty="${safe(x.key)}" data-delta="-1">−</button><span>${x.qty}</span><button data-qty="${safe(x.key)}" data-delta="1">+</button></div></div><div><b>${money(x.price*x.qty)}</b><br><button class="remove-btn" data-remove="${safe(x.key)}">Удалить</button></div></div>`).join("");
  const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
  showModal(`<h2>Корзина</h2>${lines||'<p>Пока здесь пусто. Добавь товары из каталога.</p>'}<div class="cart-total"><span>Итого</span><span>${money(total)}</span></div>${cart.length?`<button class="button button-dark" id="checkoutBtn">Оформить заказ ↗</button>`:""}`);
  $$("[data-qty]").forEach(b=>b.onclick=()=>{const item=cart.find(x=>x.key===b.dataset.qty);if(item){item.qty+=Number(b.dataset.delta);if(item.qty<1)cart=cart.filter(x=>x.key!==item.key);if(item.qty>20)item.qty=20;}updateCartCount();openCart();});
  $$("[data-remove]").forEach(b=>b.onclick=()=>{cart=cart.filter(x=>x.key!==b.dataset.remove);updateCartCount();openCart();});
  if($("#checkoutBtn"))$("#checkoutBtn").onclick=checkout;
}
async function checkout(){
  if(!user){toast("Войди или зарегистрируйся, чтобы оформить заказ.");authMode="login";openAccount();return;}
  showModal(`<h2>Оформление заказа</h2><form id="checkoutForm" class="modal-form"><label>Имя<input name="name" required value="${safe(user.name)}"></label><label>Телефон<input name="phone" required placeholder="+380…" pattern="[+0-9() -]{7,}" ></label><label>Город<input name="city" required></label><label>Адрес доставки / отделение<input name="address" required></label><button class="button button-dark" type="submit">Подтвердить заказ · ${money(cart.reduce((s,x)=>s+x.price*x.qty,0))}</button></form><p class="switch-auth">Оплата и доставка согласовываются с магазином после оформления.</p>`);
  $("#checkoutForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const result=await api("/api/orders",jsonOptions({name:f.get("name"),phone:f.get("phone"),city:f.get("city"),address:f.get("address"),items:cart.map(x=>({id:x.id,qty:x.qty,size:x.size}))}));cart=[];updateCartCount();showModal(`<h2>Заказ №${result.orderId} оформлен!</h2><p>Магазин свяжется с тобой для подтверждения деталей.</p><button class="button button-dark" id="doneBtn">Готово</button>`);$("#doneBtn").onclick=closeModal;}catch(err){toast(err.message)}};
}
function openAccount(){
  if(user){showModal(`<h2>Привет, ${safe(user.name)}!</h2><p>${safe(user.email)}</p>${user.role==="admin"?'<button class="button button-dark" id="adminOpen">Админ-панель ↗</button>':""}<button class="button button-dark" id="ordersOpen">Мои заказы</button><button class="button" id="logoutBtn">Выйти</button>`);$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});user=null;closeModal();toast("Ты вышел из аккаунта.");};if($("#adminOpen"))$("#adminOpen").onclick=openAdmin;if($("#ordersOpen"))$("#ordersOpen").onclick=openMyOrders;return;}
  renderAuth();
}
function renderAuth(){
  const register=authMode==="register";
  showModal(`<div class="modal-form"><h2>${register?"Создать аккаунт":"Войти в аккаунт"}</h2><form id="authForm">${register?'<label>Имя<input name="name" required minlength="2"></label>':""}<label>Email<input type="email" name="email" required></label><label>Пароль<input type="password" name="password" required minlength="${register?8:1}"></label><button class="button button-dark" type="submit">${register?"Зарегистрироваться":"Войти"}</button></form><p class="switch-auth">${register?"Уже есть аккаунт?":"Впервые здесь?"} <a href="#" id="switchAuth"><u>${register?"Войти":"Создать аккаунт"}</u></a></p></div>`);
  $("#switchAuth").onclick=e=>{e.preventDefault();authMode=register?"login":"register";renderAuth();};
  $("#authForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const data=await api(register?"/api/register":"/api/login",jsonOptions(Object.fromEntries(f.entries())));user=data.user;toast("Вход выполнен.");openAccount();}catch(err){toast(err.message)}};
}
async function openMyOrders(){
  try{const orders=await api("/api/my-orders");showModal(`<h2>Мои заказы</h2>${orders.length?orders.map(o=>`<div class="admin-row"><b>Заказ №${o.id}</b> · ${money(o.total)}<p>${safe(o.status)} · ${safe(o.created_at)}</p><small>${JSON.parse(o.items_json).map(i=>`${safe(i.name)} × ${i.qty}`).join(", ")}</small></div>`).join(""):"<p>У тебя пока нет заказов.</p>"}<button class="button" id="backAccount">Назад</button>`);$("#backAccount").onclick=openAccount;}catch(e){toast(e.message)}
}
function productForm(p={}){
 return `<h2>${p.id?"Изменить товар":"Добавить товар"}</h2><form id="productForm" enctype="multipart/form-data"><div class="admin-grid">
 <label>Название<input name="name" required value="${safe(p.name||"")}"></label><label>Цена, грн<input name="price" type="number" min="0" step="1" required value="${safe(p.price??"")}"></label>
 <label>Категория<select name="category" required>${["Одежда","Обувь","Аксессуары"].map(c=>`<option ${p.category===c?"selected":""}>${c}</option>`).join("")}</select></label><label>Бренд<input name="brand" value="${safe(p.brand||"")}"></label>
 <label>Цвет<input name="color" value="${safe(p.color||"")}"></label><label>Размеры через запятую<input name="sizes" value="${safe(p.sizes||"S,M,L,XL")}"></label>
 <label class="full">Описание<textarea name="description" rows="3">${safe(p.description||"")}</textarea></label><label class="full">Фото товара (JPG/PNG/WEBP, до 5 МБ)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif"></label>
 <label class="full"><input type="checkbox" name="featured" value="1" ${p.featured?"checked":""} style="width:auto"> Показывать как выбор StyleHub</label></div><button class="button button-dark" type="submit">Сохранить товар</button> <button class="button" type="button" id="cancelProduct">Назад</button></form>`;
}
async function openAdmin(){
 if(!user||user.role!=="admin"){toast("Нет доступа.");return;}
 renderAdmin();
}
async function renderAdmin(){
 try{
  if(adminTab==="products"){
   const items=await api("/api/admin/products");
   showModal(`<h2>Административная панель</h2><div class="admin-tabs"><button class="active" id="tabProducts">Товары</button><button id="tabOrders">Заказы</button></div><button class="small-btn primary-btn" id="addProduct">+ Добавить товар</button>${items.map(p=>`<div class="admin-row"><b>${safe(p.name)}</b> · ${money(p.price)}<br><small>${safe(p.category)} · ${safe(p.brand)}</small><br><button class="small-btn" data-edit="${p.id}">Изменить</button><button class="small-btn" data-delete="${p.id}">Удалить</button></div>`).join("")||"<p>Товаров пока нет.</p>"}`);
   $("#addProduct").onclick=()=>renderProductForm();$$("[data-edit]").forEach(b=>b.onclick=()=>renderProductForm(items.find(p=>p.id===Number(b.dataset.edit))));$$("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Точно удалить товар?")){try{await api(`/api/admin/products/${b.dataset.delete}`,{method:"DELETE"});toast("Товар удалён.");renderAdmin();loadProducts();}catch(e){toast(e.message)}}});
  } else {
   const orders=await api("/api/admin/orders");
   showModal(`<h2>Административная панель</h2><div class="admin-tabs"><button id="tabProducts">Товары</button><button class="active" id="tabOrders">Заказы</button></div>${orders.map(o=>`<div class="admin-row"><b>Заказ №${o.id}</b> · ${money(o.total)}<p>${safe(o.customer_name)} · ${safe(o.phone)} · ${safe(o.city)}, ${safe(o.address)}</p><small>${o.items.map(i=>`${safe(i.name)} × ${i.qty}`).join(", ")}</small><p>Статус: <select data-status="${o.id}">${["Новый","Подтверждён","Отправлен","Выполнен","Отменён"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select> <button class="small-btn" data-save-status="${o.id}">Сохранить статус</button></p></div>`).join("")||"<p>Заказов пока нет.</p>"}`);
   $$("[data-save-status]").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/orders/${b.dataset.saveStatus}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:$(`[data-status="${b.dataset.saveStatus}"]`).value})});toast("Статус сохранён.");}catch(e){toast(e.message)}});
  }
  $("#tabProducts").onclick=()=>{adminTab="products";renderAdmin()};$("#tabOrders").onclick=()=>{adminTab="orders";renderAdmin()};
 }catch(e){toast(e.message)}
}
async function renderProductForm(p=null){
 showModal(productForm(p||{}));$("#cancelProduct").onclick=renderAdmin;
 $("#productForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);fd.set("featured",e.target.featured.checked?"1":"0");try{await api(p?`/api/admin/products/${p.id}`:"/api/admin/products",{method:p?"PUT":"POST",body:fd});toast("Товар сохранён.");await loadOptions();await loadProducts();renderAdmin();}catch(err){toast(err.message)}};
}
$("#products").addEventListener("click",e=>{const target=e.target.closest("[data-open]");if(target)openProduct(Number(target.dataset.open));});
$("#cartBtn").onclick=openCart;$("#accountBtn").onclick=openAccount;
$("#searchToggle").onclick=()=>{$("#searchBar").classList.toggle("hidden");$("#searchInput").focus()};
$("#searchGo").onclick=()=>{$("#catalogSearch").value=$("#searchInput").value;loadProducts();location.hash="#catalog"};
$("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#searchGo").click()});
["catalogSearch","categoryFilter","brandFilter","sizeFilter","colorFilter","minPrice","maxPrice","sortFilter"].forEach(id=>$("#"+id).addEventListener("input",loadProducts));
$("#clearFilters").onclick=()=>{$("#catalogSearch").value="";["categoryFilter","brandFilter","sizeFilter","colorFilter","minPrice","maxPrice","sortFilter"].forEach(id=>$("#"+id).value="");loadProducts()};
$$("[data-category]").forEach(a=>a.onclick=()=>{setTimeout(()=>{$("#categoryFilter").value=a.dataset.category;loadProducts()},0)});
$("#menuToggle").onclick=()=>$("#nav").classList.toggle("open");
$("#nav").addEventListener("click",e=>{if(e.target.tagName==="A")$("#nav").classList.remove("open")});
$("#modal").addEventListener("click",e=>{if(e.target.dataset.close)closeModal()});
(async()=>{try{user=(await api("/api/me")).user;await loadOptions();await loadProducts();updateCartCount();}catch(e){toast("Не удалось подключиться к серверу.")}})();
