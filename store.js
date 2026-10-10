const SUPABASE_URL = "https://fafryvpzvewbwjgznzsg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_l4iQHwmQpCOPnoe7JBcK4w_soduEaIy";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function money(n){ return n ? "$" + Number(n).toLocaleString("es-MX") : "Consultar"; }
function offerPriceMarkup(p, cls="") {
  const oldPrice=Number(p.previousPrice)||0;
  const current=Number(p.price)||0;
  if(p.offer && oldPrice>current && current>0){
    const discount=Math.round((1-(current/oldPrice))*100);
    return `<div class="offer-price-wrap ${cls}"><span class="price-old">${money(oldPrice)}</span><strong class="price-current">${money(current)}</strong><span class="discount-badge">${discount}% OFF</span></div>`;
  }
  return `<div class="price">${money(p.price)}</div>`;
}
function esc(v){ return String(v ?? "").replace(/[&<>\"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[m])); }
function sizesOf(value){ return String(value || "").split(/[,/|]+/).map(x=>x.trim()).filter(Boolean); }

function fromDb(row){
  return {
    id: row.id,
    name: row.nombre || "",
    price: Number(row.precio) || 0,
    previousPrice: Number(row.precio_anterior) || 0,
    category: row.categoria || "",
    subcategory: row.subcategoria || "",
    brand: row.marca || "",
    model: row.modelo || "",
    desc: row.descripcion || "",
    offer: !!row.oferta,
    image: row.imagen || "",
    talla: row.talla || "",
    stock: Number(row.stock) || 0
  };
}

let products = [];
let activeCategory = "Todos";
let activeBrand = "Todas";
let activeSize = "Todas";
let detailId = null;
let detailSelectedSize = "";
let detailQuantity = 1;
let sizeInventory = new Map();
let sizeInventoryReady = false;
let catalogSort="default";
let categoryBrandRules = {};
let favorites = JSON.parse(localStorage.getItem("jsFavorites") || "[]").map(String);

// Respaldo inicial para que el filtro público nunca desaparezca si Supabase
// tarda en responder o la tabla de configuración no devuelve filas.
// Cuando la tabla categoria_marcas responde correctamente, sus datos tienen prioridad.
const FALLBACK_CATEGORY_BRANDS = {
  "carteras": ["Guess", "Steve Madden", "Michael Kors"],
  "ropa": ["Nike", "Adidas", "Puma"],
  "calzado": ["Nike", "Adidas", "New Balance"]
};

const FALLBACK_VISUAL_CATEGORIES = [
  {label:"Bolsas", key:"bolsas", icon:"👜", image:"assets/categoria-bolsas.jpg"},
  {label:"Tenis", key:"calzado", icon:"👟", image:"assets/categoria-tenis.jpg", dbCategory:"Calzado"},
  {label:"Ropa", key:"ropa", icon:"👕", image:"assets/categoria-ropa.jpg"},
  {label:"Perfumes", key:"perfumes", icon:"🧴", image:"assets/categoria-perfumes.jpg"},
  {label:"Accesorios", key:"accesorios", icon:"🎧", image:"assets/categoria-accesorios.jpg"},
  {label:"Relojes", key:"relojes", icon:"⌚", image:"assets/categoria-relojes.jpg"},
  {label:"Gorras", key:"gorras", icon:"🧢", image:"assets/categoria-gorras.jpg"},
  {label:"Lentes", key:"lentes", icon:"🕶️", image:"assets/categoria-lentes.jpg"},
  {label:"Carteras", key:"carteras", icon:"👝", image:"assets/categoria-carteras.jpg"},
  {label:"Ropa interior", key:"ropa-interior", icon:"🩲", image:"assets/categoria-ropa-interior.jpg"},
  {label:"Calcetas", key:"calcetas", icon:"🧦", image:"assets/categoria-calcetas.jpg"},
  {label:"Tecnología", key:"tecnologia", icon:"🎧", image:"assets/categoria-tecnologia.jpg"}
];

const FALLBACK_FEATURED_BRANDS = [
  {name:"Nike", image:"assets/marca-nike.jpg"},
  {name:"Adidas", image:"assets/marca-adidas.jpg"},
  {name:"Guess", image:"assets/marca-guess.jpg"},
  {name:"Michael Kors", image:"assets/marca-michael-kors.jpg"},
  {name:"Tommy Hilfiger", image:"assets/marca-tommy-hilfiger.jpg"},
  {name:"Calvin Klein", image:"assets/marca-calvin-klein.jpg"},
  {name:"Levi's", image:"assets/marca-levis.jpg"},
  {name:"Puma", image:"assets/marca-puma.jpg"}
];

let visualCategories = [...FALLBACK_VISUAL_CATEGORIES];
let featuredBrands = [...FALLBACK_FEATURED_BRANDS];

async function loadVisualCatalogConfig(){
  try{
    const [catRes, brandRes] = await Promise.all([
      supabaseClient.from("tienda_categorias").select("id,nombre,etiqueta,imagen,orden").eq("activo",true).order("orden",{ascending:true}).order("id",{ascending:true}),
      supabaseClient.from("tienda_marcas").select("id,nombre,imagen,destacada,orden").eq("activo",true).eq("destacada",true).order("orden",{ascending:true}).order("id",{ascending:true})
    ]);
    if(!catRes.error && Array.isArray(catRes.data) && catRes.data.length){
      const configured = catRes.data.map(row=>{
        const label=String(row.etiqueta||row.nombre||"").trim();
        const dbCategory=String(row.nombre||label).trim();
        const fallback=FALLBACK_VISUAL_CATEGORIES.find(x=>x.label.toLowerCase()===label.toLowerCase() || x.key===dbCategory.toLowerCase());
        return {label,key:dbCategory.toLowerCase(),dbCategory,image:String(row.imagen||fallback?.image||"").trim(),icon:fallback?.icon||"✦"};
      }).filter(x=>x.label);
      // Combina las categorías configuradas en Supabase con las categorías base
      // para que la portada no oculte categorías conocidas cuando la tabla tenga solo algunas.
      const merged = [...configured];
      FALLBACK_VISUAL_CATEGORIES.forEach(fallback=>{
        const exists=merged.some(item=>String(item.dbCategory||item.label).toLowerCase()===String(fallback.dbCategory||fallback.label).toLowerCase() || String(item.label).toLowerCase()===String(fallback.label).toLowerCase());
        if(!exists) merged.push(fallback);
      });
      visualCategories = merged;
    }
    if(!brandRes.error && Array.isArray(brandRes.data) && brandRes.data.length){
      featuredBrands = brandRes.data.map(row=>({name:String(row.nombre||"").trim(),image:String(row.imagen||"").trim()})).filter(x=>x.name);
    }
  }catch(error){
    console.warn("Configuración visual no disponible; se usa la configuración incluida en V8.3.", error);
  }
}

async function loadProducts(){
  const { data, error } = await supabaseClient.from("productos").select("*").eq("activo", true).order("id", {ascending:false});
  if(error){ console.error("Supabase:", error); products=[]; return; }
  products = (data || []).map(fromDb);
}

async function loadCategoryBrandRules(){
  const { data, error } = await supabaseClient
    .from("categoria_marcas")
    .select("categoria,marca")
    .eq("activo", true);
  if(error){
    console.warn("No se pudieron cargar las marcas configuradas por categoría. Se usa la configuración de respaldo:", error.message);
    categoryBrandRules = {...FALLBACK_CATEGORY_BRANDS};
    return;
  }
  const rules = {};
  (data || []).forEach(row=>{
    const category = String(row.categoria || "").trim();
    const brand = String(row.marca || "").trim();
    if(!category || !brand) return;
    const key = category.toLowerCase();
    if(!rules[key]) rules[key] = [];
    if(!rules[key].some(x=>x.toLowerCase()===brand.toLowerCase())) rules[key].push(brand);
  });
  // Combina lo que exista en Supabase con el respaldo por categoría.
  // Esto evita el error anterior: si Supabase devuelve Ropa/Calzado pero
  // Carteras falta o está inactiva, Carteras NO debe quedar sin filtro.
  categoryBrandRules = {...FALLBACK_CATEGORY_BRANDS, ...rules};
}

function allowedBrandsForCategory(category){
  const key = String(category || "").trim().toLowerCase();
  const configured = categoryBrandRules[key];
  return configured && configured.length ? configured : (FALLBACK_CATEGORY_BRANDS[key] || []);
}

function hasConfiguredBrands(category){
  return allowedBrandsForCategory(category).length > 0;
}

function uniqueNormalized(values){
  const seen=new Map();
  values.forEach(value=>{
    const label=String(value||"").trim();
    if(!label) return;
    const key=label.toLowerCase();
    if(!seen.has(key)) seen.set(key,label);
  });
  return [...seen.values()];
}

function getCats(){
  const configured=visualCategories.map(x=>x.dbCategory || x.label);
  const extras=uniqueNormalized(products.map(p=>p.category)).filter(c=>!configured.some(x=>x.toLowerCase()===c.toLowerCase()));
  return ["Todos", ...configured, ...extras];
}
function categoryConfigLabel(category){
  const key=String(category||"").trim().toLowerCase();
  const item=visualCategories.find(x=>String(x.dbCategory||x.label).trim().toLowerCase()===key || String(x.label).trim().toLowerCase()===key);
  return item?.label || category;
}
function renderVisualCategories(){
  const wrap=document.getElementById("cats");
  if(!wrap) return;
  wrap.innerHTML=visualCategories.map(item=>{
    const actual=item.dbCategory || item.label;
    const selected=(String(activeCategory).toLowerCase()===String(actual).toLowerCase()) || (item.label==="Tenis" && activeCategory==="Calzado");
    const src=item.image || "";
    return `<div class="visual-cat ${selected?"selected":""}">
      <button type="button" class="visual-cat-image" data-visual-category="${esc(actual)}" aria-label="Ver ${esc(item.label)} en el catálogo">${src?`<img src="${esc(src)}" alt="${esc(item.label)}" onerror="this.style.display='none';this.parentElement.classList.add('image-missing')">`:`<span class="visual-cat-icon">${esc(item.icon||"✦")}</span>`}</button>
      <button type="button" class="visual-cat-name" data-visual-category="${esc(actual)}">${esc(item.label)}</button>
    </div>`;
  }).join("");
  wrap.querySelectorAll("[data-visual-category]").forEach(btn=>btn.addEventListener("click",()=>chooseCategory(btn.dataset.visualCategory)));
}
function renderFeaturedBrands(){
  const wrap=document.getElementById("featuredBrands");
  if(!wrap) return;
  wrap.innerHTML=featuredBrands.map(brand=>{
    const asset=brand.image||"";
    return `<button type="button" class="featured-brand" data-featured-brand="${esc(brand.name)}" title="Ver ${esc(brand.name)}">
      ${asset?`<img src="${esc(asset)}" alt="${esc(brand.name)}" onerror="this.style.display='none';this.parentElement.classList.add('image-missing')">`:`<span class="featured-brand-name">${esc(brand.name)}</span>`}
    </button>`;
  }).join("");
  wrap.querySelectorAll("[data-featured-brand]").forEach(btn=>btn.addEventListener("click",()=>{
    activeCategory="Todos";
    activeBrand=btn.dataset.featuredBrand;
    activeSize="Todas";
    renderStore();
    document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth"});
  }));
}

function getBrands(){
  // IMPORTANTE: las marcas públicas son independientes de las tallas y de los productos.
  // Estas son las marcas configuradas para cada categoría. Supabase puede agregar otras,
  // pero nunca puede dejar una categoría sin sus marcas base.
  const base = {
    carteras: ["Guess", "Steve Madden", "Michael Kors"],
    ropa: ["Nike", "Adidas", "Puma"],
    calzado: ["Nike", "Adidas", "New Balance"]
  };
  if(activeCategory === "Todos"){
    const all=[...Object.values(base).flat(), ...Object.values(categoryBrandRules).flat()];
    return ["Todas", ...uniqueNormalized(all).sort((a,b)=>a.localeCompare(b,"es"))];
  }
  const key=String(activeCategory||"").trim().toLowerCase();
  const all=[...(base[key]||[]), ...(categoryBrandRules[key]||[])];
  return ["Todas", ...uniqueNormalized(all).sort((a,b)=>a.localeCompare(b,"es"))];
}
function getSizes(){
  // Las tallas son independientes de la configuración de marcas, pero sus
  // opciones se calculan sobre la combinación de filtros que ya eligió el cliente.
  // Así, por ejemplo, Calzado → Nike solo muestra las tallas que realmente
  // existen para Nike, sin inventar tallas ni mezclar otras marcas.
  const categoryKey = String(activeCategory || "").trim().toLowerCase();
  const brandKey = String(activeBrand || "").trim().toLowerCase();
  const scoped = products.filter(p => {
    const sameCategory = activeCategory === "Todos" ||
      String(p.category || "").trim().toLowerCase() === categoryKey;
    const sameBrand = activeBrand === "Todas" ||
      String(p.brand || "").trim().toLowerCase() === brandKey;
    return sameCategory && sameBrand;
  });
  const sizes = uniqueNormalized(scoped.flatMap(p=>sizesOf(p.talla)))
    .sort((a,b)=>a.localeCompare(b,"es",{numeric:true,sensitivity:"base"}));
  return sizes.length ? ["Todas", ...sizes] : [];
}

let cart = JSON.parse(localStorage.getItem("jsCart") || "[]");
function saveCart(){ localStorage.setItem("jsCart", JSON.stringify(cart)); }
function saveFavorites(){ localStorage.setItem("jsFavorites", JSON.stringify(favorites)); }
function favoriteCount(){ return favorites.length; }
function updateFavoriteCount(){ const el=document.getElementById("favoriteCount"); if(el) el.textContent=favoriteCount(); }
function toggleFavorite(id){
  const key=String(id);
  if(favorites.includes(key)) favorites=favorites.filter(x=>String(x)!==key);
  else favorites.push(key);
  saveFavorites(); updateFavoriteCount(); renderFavorites(); renderStore();
}
function openFavorites(){ const panel=document.getElementById("favorites"); if(!panel)return; renderFavorites(); panel.classList.add("open"); document.getElementById("shade")?.classList.add("open"); }
function closeFavorites(){ document.getElementById("favorites")?.classList.remove("open"); if(!document.getElementById("cart")?.classList.contains("open")) document.getElementById("shade")?.classList.remove("open"); }
function renderFavorites(){
  favorites=favorites.filter(id=>products.some(p=>String(p.id)===String(id))); saveFavorites(); updateFavoriteCount();
  const el=document.getElementById("favoriteItems"); if(!el)return;
  if(!favorites.length){ el.innerHTML='<p class="empty">Aún no tienes productos favoritos.</p>'; return; }
  el.innerHTML=favorites.map(id=>{
    const p=products.find(x=>String(x.id)===String(id)); if(!p)return '';
    return `<div class="favorite-line"><div class="favorite-line-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Sin foto</span>'}</div><div class="favorite-line-info"><b>${esc(p.name)}</b><small>${money(p.price)} · ${stockLabel(p)}</small><div class="favorite-line-actions"><button class="favorite-add" onclick="add(${p.id})" ${(!sizesForProduct(p).length && p.stock<=0)?'disabled':''}>Agregar al carrito</button><button class="favorite-remove" onclick="toggleFavorite(${p.id})">Quitar</button></div></div></div>`;
  }).join('');
}
function cartKey(item){ return `${String(item.id)}::${String(item.size||"").toLowerCase()}`; }
function sizesForProduct(p){ return sizesOf(p?.talla); }
function sizeStockFor(id,size){ const row=sizeInventory.get(`${String(id)}::${String(size||"").toLowerCase()}`); return row ? Number(row.stock)||0 : 0; }
async function refreshSizeInventory(){
  const {data,error}=await supabaseClient.from("inventario_tallas").select("producto_id,talla,stock,vendidas");
  if(error){ console.warn("No se pudo validar inventario por talla:",error.message); sizeInventoryReady=false; return false; }
  sizeInventory=new Map((data||[]).map(r=>[`${String(r.producto_id)}::${String(r.talla||"").toLowerCase()}`,{stock:Number(r.stock)||0,vendidas:Number(r.vendidas)||0,talla:r.talla}]));
  sizeInventoryReady=true;
  return true;
}
function productAvailable(p,size=""){
  if(!p) return 0;
  if(sizesForProduct(p).length) return size ? sizeStockFor(p.id,size) : 0;
  return Math.max(0,Number(p.stock)||0);
}
function stockLabel(p){
  if(sizesForProduct(p).length){
    const total=sizesForProduct(p).reduce((sum,size)=>sum+sizeStockFor(p.id,size),0);
    return total>0?`${total} disponibles en tallas`:'Agotado';
  }
  return Number(p.stock)>0?`${Number(p.stock)} disponibles`:'Agotado';
}
async function add(id,size="",quantity=1,replaceExisting=false){
  const p=products.find(x=>String(x.id)===String(id)); if(!p) return;
  const sizes=sizesForProduct(p);
  if(sizes.length && !size){ openDetail(id); return; }
  if(sizes.length){
    if(!await refreshSizeInventory()) return alert("No se pudo comprobar el inventario. Intenta de nuevo.");
    if(!sizes.some(s=>s.toLowerCase()===String(size).toLowerCase())) return alert("Selecciona una talla válida.");
  }
  const key=`${String(p.id)}::${String(size||"").toLowerCase()}`;
  const existing=cart.find(i=>cartKey(i)===key);
  const requested=Math.max(1,Number(quantity)||1);
  // Desde el detalle, la cantidad elegida representa el total deseado para esa talla;
  // no se vuelve a sumar la cantidad que ya estuviera en el carrito.
  const wanted=replaceExisting ? requested : (existing?.qty||0)+requested;
  const available=productAvailable(p,size);
  if(available<=0) return alert(size?`La talla ${size} está agotada.`:"Este producto está agotado.");
  if(wanted>available) return alert(`Solo hay ${available} ${size?`pieza(s) de talla ${size}`:'unidad(es)'} disponibles. Ajusta la cantidad.`);
  if(existing) existing.qty=wanted; else cart.push({id:p.id,size:size||"",qty:requested});
  saveCart(); renderCart(); closeDetail(); openCart();
}
async function qty(id,d,size=""){
  const key=`${String(id)}::${String(size||"").toLowerCase()}`;
  const item=cart.find(i=>cartKey(i)===key); if(!item)return;
  if(d>0){
    if(sizesForProduct(products.find(p=>String(p.id)===String(id))).length && !await refreshSizeInventory()) return alert("No se pudo comprobar el inventario. Intenta de nuevo.");
    const p=products.find(x=>String(x.id)===String(id));
    const available=productAvailable(p,size);
    if(item.qty+1>available) return alert(`No puedes agregar más. Disponibles: ${available} ${size?`de talla ${size}`:"unidades"}.`);
  }
  item.qty+=d; if(item.qty<1)cart=cart.filter(i=>cartKey(i)!==key); saveCart(); renderCart();
}
function removeFromCart(id,size=""){
  const normalizedId=String(id);
  const normalizedSize=String(size||"").trim().toLowerCase();
  const before=cart.length;
  cart=cart.filter(i=>!(String(i.id)===normalizedId && String(i.size||"").trim().toLowerCase()===normalizedSize));
  saveCart();
  renderCart();
  return cart.length < before;
}
window.qty = qty;
window.removeFromCart = removeFromCart;
function openCart(){ document.getElementById("cart").classList.add("open"); document.getElementById("shade").classList.add("open"); renderCart(); }
function closeCart(){ document.getElementById("cart").classList.remove("open"); document.getElementById("shade").classList.remove("open"); }
function renderCart(){
  const el=document.getElementById("cartItems"); if(!el)return;
  cart=cart.filter(i=>products.some(p=>String(p.id)===String(i.id)));
  // Los artículos antiguos sin talla no pueden seguir en el carrito si el producto requiere talla.
  cart=cart.filter(i=>!sizesForProduct(products.find(p=>String(p.id)===String(i.id))).length || !!i.size);
  el.innerHTML=cart.length?cart.map(i=>{const p=products.find(x=>String(x.id)===String(i.id));const available=productAvailable(p,i.size);const sizeLabel=i.size?`<br><small>Talla: <b>${esc(i.size)}</b> · ${available} disponibles</small>`:"";const disabled=i.qty>=available?"disabled":"";return `<div class="cart-line"><div class="cart-line-info"><b>${esc(p.name)}</b>${sizeLabel}<br><small>${money(p.price)} c/u</small>${i.qty>available?'<small class="stock-note stock-error">Cantidad mayor a la existencia; reduce tu pedido.</small>':''}</div><div class="cart-line-actions"><div class="qty"><button type="button" data-cart-action="decrease" data-product-id="${esc(p.id)}" data-size="${esc(i.size||"")}" aria-label="Disminuir cantidad">−</button><b>${i.qty}</b><button type="button" data-cart-action="increase" data-product-id="${esc(p.id)}" data-size="${esc(i.size||"")}" aria-label="Aumentar cantidad" ${disabled}>+</button></div><button type="button" class="cart-remove" data-cart-action="remove" data-product-id="${esc(p.id)}" data-size="${esc(i.size||"")}" aria-label="Eliminar ${esc(p.name)} del carrito">Eliminar</button></div></div>`}).join(""):'<p class="empty">Tu carrito está vacío.</p>';
  const total=cart.reduce((s,i)=>{const p=products.find(x=>String(x.id)===String(i.id));return p?s+p.price*i.qty:s},0);
  document.getElementById("total").textContent=money(total); document.getElementById("count").textContent=cart.reduce((s,i)=>s+i.qty,0); saveCart();
}
async function sendOrder(){
  if(!cart.length)return alert("Agrega productos al carrito.");
  if(cart.some(i=>sizesForProduct(products.find(p=>String(p.id)===String(i.id))).length)){
    if(!await refreshSizeInventory()) return alert("No pudimos comprobar las existencias actuales. No se envió el pedido; intenta de nuevo.");
  }
  const issues=[];
  for(const i of cart){const p=products.find(x=>String(x.id)===String(i.id));if(!p)continue;const available=productAvailable(p,i.size);if(sizesForProduct(p).length&&!i.size)issues.push(`${p.name}: falta seleccionar talla.`);else if(available<i.qty)issues.push(`${p.name}${i.size?` (talla ${i.size})`:""}: solicitaste ${i.qty}, pero solo quedan ${available}.`);}
  renderCart();
  if(issues.length){alert("Actualizamos la validación del inventario. Corrige tu carrito antes de enviar:\n\n"+issues.join("\n"));return;}
  let total=0,msg="Hola, JS Trendy Shop. Quiero realizar el siguiente pedido:\n\n";
  cart.forEach(i=>{
    const p=products.find(x=>String(x.id)===String(i.id)); if(!p)return;
    total+=p.price*i.qty;
    msg+=`• ${p.name}${i.size?` — Talla ${i.size}`:""} x${i.qty} — ${money(p.price*i.qty)}\n`;
    msg+=`📸 Foto del producto: https://jstrendyshop.com/f.html?id=${encodeURIComponent(p.id)}\n`;
  });
  msg+=`\nTotal: ${money(total)}\n\n¿Me confirman disponibilidad?`;
  const wa=localStorage.getItem("jsWhatsApp")||"526624262742";
  window.open("https://wa.me/"+wa+"?text="+encodeURIComponent(msg),"_blank");
}
function chooseBrand(name){
  const target = String(name || "").trim().toLowerCase();
  if(target === "todas") {
    activeBrand = "Todas";
    activeSize = "Todas";
    renderStore();
    return;
  }
  // Primero usamos la etiqueta configurada para la categoría actual.
  // Si no existe, conservamos el nombre elegido por el usuario.
  const configured = getBrands().find(b => String(b).trim().toLowerCase() === target);
  activeBrand = configured || name;
  activeSize = "Todas";
  renderStore();
}
function chooseAll(){
  activeCategory = "Todos";
  activeBrand = "Todas";
  activeSize = "Todas";
  const search = document.getElementById("search");
  if(search) search.value = "";
  renderStore();
  document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth", block:"start"});
}
function chooseCategory(name){
  const normalized=String(name||"").trim().toLowerCase();
  if(normalized === "todos"){
    chooseAll();
    return;
  }
  const visual = visualCategories.find(x => String(x.label).trim().toLowerCase()===normalized);
  activeCategory = visual?.dbCategory || (normalized === "tenis" ? "Calzado" : name);
  // Al cambiar de categoría, reiniciamos marca y talla para no arrastrar filtros anteriores.
  activeBrand = "Todas";
  activeSize = "Todas";
  renderStore();
  document.getElementById("catalogo")?.scrollIntoView({behavior:"smooth", block:"start"});
}
function chooseSize(name){
  activeSize = name;
  renderStore();
}

function matches(p,query){
  const text=[p.name,p.desc,p.category,p.subcategory,p.brand,p.model,p.talla].join(" ").toLowerCase();
  return !query || text.includes(query);
}

function renderCatalogCategoryTabs(){
  const wrap=document.getElementById("catalogCategoryTabs");
  if(!wrap) return;
  const items=[{label:"Todos", dbCategory:"Todos"}, ...visualCategories.map(x=>({label:String(x.label||x.dbCategory||"").trim(), dbCategory:x.dbCategory||x.label}))];
  const seen=new Set();
  wrap.innerHTML=items.filter(item=>{
    const key=item.label.toLowerCase();
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item=>{
    const active = String(activeCategory).trim().toLowerCase()===String(item.dbCategory).trim().toLowerCase() ||
      (item.dbCategory!=="Todos" && String(activeCategory).trim().toLowerCase()===String(item.label).trim().toLowerCase());
    return `<button type="button" class="catalog-category-tab${active?' active':''}" data-catalog-category="${esc(item.label)}">${esc(item.label)}</button>`;
  }).join("");
  wrap.querySelectorAll("[data-catalog-category]").forEach(btn=>{
    btn.addEventListener("click",()=>chooseCategory(btn.dataset.catalogCategory));
  });
}

function renderStore(){
  const query=(document.getElementById("search")?.value||"").trim().toLowerCase();
  let visible=products.filter(p=>
    (activeCategory==="Todos"||String(p.category||"").trim().toLowerCase()===String(activeCategory||"").trim().toLowerCase()) &&
    (activeBrand==="Todas"||String(p.brand||"").trim().toLowerCase()===String(activeBrand).trim().toLowerCase()) &&
    (activeSize==="Todas"||sizesOf(p.talla).some(size => String(size).trim().toLowerCase()===String(activeSize).trim().toLowerCase())) && matches(p,query)
  );
  if(catalogSort==="price-asc") visible.sort((a,b)=>(Number(a.price)||0)-(Number(b.price)||0));
  if(catalogSort==="price-desc") visible.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0));

  renderCatalogCategoryTabs();
  renderVisualCategories();
  renderFeaturedBrands();
  const sizeWrap=document.getElementById("sizes");
  const sizes=getSizes();
  sizeWrap.innerHTML=sizes.map(s=>`<button type="button" class="${s===activeSize?"selected":""}" data-size="${esc(s)}">${esc(s)}</button>`).join("");
  sizeWrap.querySelectorAll("[data-size]").forEach(btn=>btn.addEventListener("click",()=>chooseSize(btn.dataset.size)));
  const sizeSection=document.getElementById("sizeFilterBlock");
  if(sizeSection) sizeSection.style.display=sizes.length ? "" : "none";
  renderOffers();

  const title=document.getElementById("catalogResultsTitle");
  const count=document.getElementById("catalogResultsCount");
  if(title){
    const activeLabel=activeCategory==="Todos"?"Todos los productos":(visualCategories.find(x=>String(x.dbCategory).toLowerCase()===String(activeCategory).toLowerCase())?.label || activeCategory);
    title.textContent=activeLabel;
  }
  if(count) count.textContent=`${visible.length} ${visible.length===1?'producto':'productos'}`;
  document.getElementById("products").innerHTML=visible.map(p=>{
    const sizes=sizesOf(p.talla);
    return `<article class="product catalog-product-card"><div class="pic">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'Foto del producto'}${p.offer?'<span class="offer-badge">OFERTA</span>':''}<button type="button" class="product-heart ${favorites.includes(String(p.id))?'is-favorite':''}" aria-label="${favorites.includes(String(p.id))?'Quitar de favoritos':'Agregar a favoritos'}" title="${favorites.includes(String(p.id))?'Quitar de favoritos':'Favorito'}" onclick="event.stopPropagation();toggleFavorite(${p.id})">${favorites.includes(String(p.id))?'♥':'♡'}</button></div><div class="product-body"><div class="tag">${esc(p.brand||p.category)}${p.category&&p.brand?' · '+esc(p.category):''}</div><h3>${esc(p.name)}</h3>${p.model?`<p class="model-line">Modelo: <b>${esc(p.model)}</b></p>`:''}${sizes.length?`<div class="size-list"><span>Tallas:</span>${sizes.slice(0,5).map(s=>`<b>${esc(s)}</b>`).join('')}</div>`:''}<div class="product-bottom"><div class="price">${money(p.price)}</div><small>${stockLabel(p)}</small></div><button class="secondary catalog-add" onclick="openDetail(${p.id})">Ver producto</button></div></article>`;
  }).join("")||'<p class="empty">No encontramos productos con esos filtros.</p>';
  renderCart();
}

let activeOfferCategory = "Todos";

function renderOfferCategoryTabs(offers){
  const wrap=document.getElementById("offerCategoryTabs");
  if(!wrap) return;
  const standard=["Todos","Calzado","Bolsas","Perfumes","Accesorios","Ropa"];
  const extra=Array.from(new Set(offers.map(p=>String(p.category||"").trim()).filter(Boolean)))
    .filter(cat=>!standard.some(x=>x.toLowerCase()===cat.toLowerCase()));
  const categories=[...standard,...extra];
  const current=categories.some(x=>x.toLowerCase()===String(activeOfferCategory).toLowerCase()) ? activeOfferCategory : "Todos";
  activeOfferCategory=current;
  wrap.innerHTML=categories.map(cat=>{
    const active=String(cat).toLowerCase()===String(activeOfferCategory).toLowerCase();
    return `<button type="button" class="offer-category-tab${active?' active':''}" data-offer-category="${esc(cat)}">${esc(cat)}</button>`;
  }).join("");
  wrap.querySelectorAll("[data-offer-category]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      activeOfferCategory=btn.dataset.offerCategory||"Todos";
      renderOffers();
    });
  });
}

function renderOffers(){
  const el=document.getElementById("offerProducts");
  if(!el) return;
  const allOffers=products.filter(p=>p.offer);
  renderOfferCategoryTabs(allOffers);
  const categoryKey=String(activeOfferCategory||"Todos").trim().toLowerCase();
  const offers=categoryKey==="todos" ? allOffers : allOffers.filter(p=>String(p.category||"").trim().toLowerCase()===categoryKey);
  if(!allOffers.length){
    el.innerHTML='<div class="offers-empty"><div><p class="offers-kicker">PROMOCIONES</p><h3>Aún no hay ofertas</h3><p>Cuando marques productos como oferta desde el panel de administración, aparecerán aquí automáticamente.</p></div></div>';
    return;
  }
  if(!offers.length){
    el.innerHTML='<div class="offers-empty"><div><p class="offers-kicker">SIN RESULTADOS</p><h3>No hay ofertas en esta categoría</h3><p>Prueba con otra categoría para ver los productos disponibles.</p></div></div>';
    return;
  }
  el.innerHTML=offers.map(p=>{
    const sizes=sizesOf(p.talla);
    const categoryLabel=p.category||"Producto";
    return `<article class="product offer-product-card"><div class="pic">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'Foto del producto'}<span class="offer-badge">OFERTA</span></div><div class="product-body"><div class="tag">${esc(p.brand||categoryLabel)}${p.category&&p.brand?' · '+esc(p.category):''}</div><h3>${esc(p.name)}</h3>${p.model?`<p class="model-line">Modelo: <b>${esc(p.model)}</b></p>`:''}${sizes.length?`<div class="size-list"><span>Tallas:</span>${sizes.slice(0,5).map(x=>`<b>${esc(x)}</b>`).join('')}</div>`:''}<div class="product-bottom"><div>${offerPriceMarkup(p)}</div><small>${stockLabel(p)}</small></div><div class="product-actions"><button class="secondary" onclick="openDetail(${p.id})">Ver producto</button><button class="add" onclick="openDetail(${p.id})">Elegir talla / agregar</button></div></div></article>`;
  }).join('');
}

async function openDetail(id){
  detailId=id;
  // No seleccionar ninguna talla por defecto: la selección visual siempre
  // corresponde a la talla que el cliente tocó explícitamente.
  detailSelectedSize="";
  detailQuantity=1;
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return;
  const sizes=sizesForProduct(p);
  if(sizes.length) await refreshSizeInventory();
  const available=sizes.length?Math.max(0,sizes.reduce((sum,size)=>sum+sizeStockFor(p.id,size),0)):Math.max(0,Number(p.stock)||0);
  const sizeControls=sizes.length?`<div class="detail-sizes"><b>Selecciona talla</b><div id="detailSizeButtons" class="detail-size-buttons" role="group" aria-label="Seleccionar talla">${sizes.map(s=>{const stock=sizeStockFor(p.id,s);return `<button type="button" class="detail-size-button" data-size="${esc(s)}" aria-pressed="false" ${stock<=0?'disabled':''}><strong>${esc(s)}</strong><span>${stock} ${stock===1?'disponible':'disponibles'}</span></button>`}).join('')}</div><p id="detailSizeStock" class="stock-note">Selecciona una talla para consultar las piezas disponibles.</p></div>`:'';
  const description=p.desc?`<div class="detail-description-wrap"><h3 class="detail-description-title">Descripción</h3><button type="button" id="detailDescriptionToggle" class="detail-description-toggle" aria-expanded="false" aria-controls="detailDescription">Ver descripción <span aria-hidden="true">＋</span></button><p id="detailDescription" class="detail-description">${esc(p.desc)}</p></div>`:'';
  document.getElementById("detailContent").innerHTML=`<div class="detail-image">${p.image?`<button type="button" class="detail-image-open" aria-label="Ver imagen completa de ${esc(p.name)}"><img src="${esc(p.image)}" alt="${esc(p.name)}"><span class="detail-image-hint">Toca la imagen para verla completa</span></button>`:'Sin imagen'}</div><div class="detail-info"><div class="tag">${esc(p.brand||p.category)}</div><h2>${esc(p.name)}</h2>${p.model?`<p><b>Modelo:</b> ${esc(p.model)}</p>`:''}${description}${sizeControls}<div class="detail-quantity-control"><label for="detailQuantity">Cantidad</label><div class="detail-quantity-buttons"><button type="button" onclick="changeDetailQuantity(-1)" aria-label="Disminuir cantidad" ${available<=1?'disabled':''}>−</button><input id="detailQuantity" type="number" min="1" max="${available}" value="1" onchange="onDetailQuantityChange(this.value)"><button type="button" onclick="changeDetailQuantity(1)" aria-label="Aumentar cantidad" ${available<=1?'disabled':''}>+</button></div></div><div class="detail-price">${offerPriceMarkup(p,"detail-offer-price")}</div><p id="detailAvailability" class="stock-note">${sizes.length?'Elige una talla para agregar al carrito':(available>0?`${available} disponibles`:'Actualmente agotado')}</p><button id="detailAddBtn" class="btn full" onclick="addFromDetail()" ${available<=0?'disabled':''}>Agregar al carrito</button></div>`;
  // En móvil, permite abrir la foto en un visor de pantalla completa sin recortarla.
  const detailImageButton=document.querySelector(".detail-image-open");
  if(detailImageButton){
    detailImageButton.addEventListener("click",()=>openProductImage(p.image,p.name));
  }
  // En móvil la descripción se muestra bajo demanda; en escritorio permanece visible.
  const descriptionToggle=document.getElementById("detailDescriptionToggle");
  const descriptionText=document.getElementById("detailDescription");
  if(descriptionToggle && descriptionText){
    descriptionToggle.addEventListener("click",()=>{
      const expanded=descriptionToggle.getAttribute("aria-expanded")==="true";
      descriptionToggle.setAttribute("aria-expanded",expanded?"false":"true");
      descriptionText.classList.toggle("expanded",!expanded);
      descriptionToggle.innerHTML=expanded?'Ver descripción <span aria-hidden="true">＋</span>':'Ocultar descripción <span aria-hidden="true">−</span>';
    });
  }
  // Conectar cada botón con un listener real después de renderizar el modal.
  document.querySelectorAll("#detailSizeButtons .detail-size-button").forEach(button=>{
    button.addEventListener("click",()=>onDetailSizeChange(button.dataset.size));
  });
  document.getElementById("detailModal").classList.remove("hidden");
}
window.onDetailSizeChange = onDetailSizeChange;
function onDetailSizeChange(size){
  const p=products.find(x=>String(x.id)===String(detailId));
  if(!p)return;
  const validSize=sizesForProduct(p).find(s=>String(s).toLowerCase()===String(size||'').toLowerCase());
  if(!validSize || sizeStockFor(p.id,validSize)<=0)return;
  detailSelectedSize=validSize;
  detailQuantity=1;
  document.querySelectorAll('#detailSizeButtons .detail-size-button').forEach(button=>{
    const selected=String(button.dataset.size||'').toLowerCase()===String(validSize).toLowerCase();
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',selected?'true':'false');
  });
  const available=sizeStockFor(p.id,validSize);
  const qty=document.getElementById("detailQuantity");
  if(qty){qty.disabled=false;qty.value="1";qty.max=String(available);}
  document.querySelectorAll('.detail-quantity-buttons button').forEach(button=>{const minus=button.textContent.trim()==="−";button.disabled=available<=1||minus;});
  const stock=document.getElementById("detailSizeStock");
  if(stock)stock.textContent=`${available} disponibles de talla ${validSize}`;
  const note=document.getElementById("detailAvailability");
  if(note)note.textContent=`${available} disponibles de esta talla`;
  const btn=document.getElementById("detailAddBtn");if(btn)btn.disabled=false;
}
function onDetailQuantityChange(value){
  const p=products.find(x=>String(x.id)===String(detailId));if(!p)return;
  const sizes=sizesForProduct(p);
  const available=sizes.length?(detailSelectedSize?sizeStockFor(p.id,detailSelectedSize):sizes.reduce((sum,size)=>sum+sizeStockFor(p.id,size),0)):Math.max(0,Number(p.stock)||0);
  detailQuantity=Math.max(1,Math.min(available||1,parseInt(value,10)||1));
  const input=document.getElementById("detailQuantity");if(input){input.value=String(detailQuantity);input.max=String(available||1);}
  document.querySelectorAll(".detail-quantity-buttons button").forEach(button=>{const minus=button.textContent.trim()==="−";button.disabled=available<=1||(minus&&detailQuantity<=1)||(!minus&&detailQuantity>=available);});
}
function changeDetailQuantity(delta){
  const input=document.getElementById("detailQuantity");if(!input||input.disabled)return;
  onDetailQuantityChange((parseInt(input.value,10)||1)+delta);
}
async function addFromDetail(){
  const p=products.find(x=>String(x.id)===String(detailId));if(!p)return;
  if(sizesForProduct(p).length&&!detailSelectedSize)return alert("Primero selecciona la talla que quieres agregar al carrito.");
  onDetailQuantityChange(document.getElementById("detailQuantity")?.value||1);
  await add(p.id,detailSelectedSize,detailQuantity,true);
}

function openProductImage(src,name){
  if(!src)return;
  let viewer=document.getElementById("productImageViewer");
  if(!viewer){
    viewer=document.createElement("div");
    viewer.id="productImageViewer";
    viewer.className="product-image-viewer hidden";
    viewer.innerHTML='<button type="button" class="product-image-viewer-close" aria-label="Cerrar imagen">×</button><img alt="">';
    document.body.appendChild(viewer);
    viewer.addEventListener("click",event=>{if(event.target===viewer||event.target.closest(".product-image-viewer-close"))viewer.classList.add("hidden");});
    document.addEventListener("keydown",event=>{if(event.key==="Escape")viewer.classList.add("hidden");});
  }
  const img=viewer.querySelector("img");img.src=src;img.alt=name||"Imagen completa del producto";
  viewer.classList.remove("hidden");
}
function closeDetail(){document.getElementById("detailModal").classList.add("hidden");detailId=null;}

async function startStore(){
  if(!document.getElementById("products"))return;
  document.getElementById("search").oninput=renderStore;
  document.getElementById("catalogSort")?.addEventListener("change",e=>{catalogSort=e.target.value;renderStore();});
  document.getElementById("cartBtn").onclick=openCart;
  // Delegación de eventos: garantiza que los botones del carrito sigan funcionando
  // aunque el contenido se vuelva a dibujar después de cambiar cantidades.
  const cartItemsEl=document.getElementById("cartItems");
  if(cartItemsEl && !cartItemsEl.dataset.actionsBound){
    cartItemsEl.dataset.actionsBound="true";
    cartItemsEl.addEventListener("click", async event=>{
      const button=event.target.closest("button[data-cart-action]");
      if(!button || !cartItemsEl.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const id=button.dataset.productId;
      const size=button.dataset.size||"";
      const action=button.dataset.cartAction;
      if(action==="remove") removeFromCart(id,size);
      else if(action==="decrease") await qty(id,-1,size);
      else if(action==="increase") await qty(id,1,size);
    });
  }
  document.getElementById("favoritesBtn")?.addEventListener("click",openFavorites);
  document.getElementById("favoritesClose")?.addEventListener("click",closeFavorites);
  document.getElementById("close").onclick=closeCart;
  document.getElementById("shade").onclick=()=>{ closeCart(); closeFavorites(); };
  document.getElementById("send").onclick=sendOrder;
  document.getElementById("detailClose").onclick=closeDetail;
  document.getElementById("detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")closeDetail();});
  document.querySelector('[data-category="Todos"]')?.addEventListener("click",chooseAll);
  document.getElementById("catalogAllBtn")?.addEventListener("click",chooseAll);
  // Los botones de la portada despliegan el resto sin salir de la página.
  const allCategoriesBtn=document.querySelector('[data-view-all-categories]');
  allCategoriesBtn?.addEventListener("click",()=>{
    const wrap=document.getElementById("cats");
    if(!wrap) return;
    const expanded=!wrap.classList.contains("is-expanded");
    wrap.classList.toggle("is-expanded", expanded);
    allCategoriesBtn.setAttribute("aria-expanded",String(expanded));
    allCategoriesBtn.innerHTML=expanded?'Ver menos <span>−</span>':'Ver todas <span>＋</span>';
  });
  const allBrandsBtn=document.querySelector('[data-view-all-brands]');
  allBrandsBtn?.addEventListener("click",()=>{
    const wrap=document.getElementById("featuredBrands");
    if(!wrap) return;
    const expanded=wrap.classList.toggle("is-expanded");
    allBrandsBtn.setAttribute("aria-expanded",String(expanded));
    allBrandsBtn.innerHTML=expanded?'Ver menos <span>−</span>':'Ver todas <span>＋</span>'; 
  });
  // Cualquier enlace que lleve al Catálogo debe mostrar nuevamente TODO el catálogo,
  // limpiando la categoría, marca, talla y búsqueda que estuvieran seleccionadas.
  document.querySelectorAll('a[href="#catalogo"]').forEach(link=>{
    link.addEventListener("click",e=>{
      e.preventDefault();
      chooseAll();
    });
  });
  document.getElementById("products").innerHTML='<p class="empty">Cargando productos...</p>';
  await loadProducts();
  await refreshSizeInventory();
  await loadCategoryBrandRules();
  renderFavorites();
  await loadVisualCatalogConfig();
  renderStore();
}
startStore();
