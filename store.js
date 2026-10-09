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
  {label:"Calcetas", key:"calcetas", icon:"🧦", image:"assets/categoria-calcetas.jpg"}
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
      visualCategories = catRes.data.map(row=>{
        const label=String(row.etiqueta||row.nombre||"").trim();
        const dbCategory=String(row.nombre||label).trim();
        const fallback=FALLBACK_VISUAL_CATEGORIES.find(x=>x.label.toLowerCase()===label.toLowerCase() || x.key===dbCategory.toLowerCase());
        return {label,key:dbCategory.toLowerCase(),dbCategory,image:String(row.imagen||fallback?.image||"").trim(),icon:fallback?.icon||"✦"};
      }).filter(x=>x.label);
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
  const {data:sizeRows,error:sizeError}=await supabaseClient.from("inventario_tallas").select("producto_id,talla,stock,vendidas");
  if(sizeError){console.warn("No se pudo consultar inventario por talla; se usa stock general.",sizeError.message);products=products.map(p=>({...p,availableSizes:sizesOf(p.talla),sizeInventory:null}));return;}
  const byProduct=new Map();
  (sizeRows||[]).forEach(row=>{const key=String(row.producto_id);if(!byProduct.has(key))byProduct.set(key,[]);byProduct.get(key).push({...row,stock:Math.max(0,Number(row.stock)||0)});});
  products=products.map(p=>{const rows=byProduct.get(String(p.id));if(!rows?.length)return {...p,availableSizes:sizesOf(p.talla),sizeInventory:null};const available=rows.filter(r=>r.stock>0);return {...p,stock:rows.reduce((sum,r)=>sum+r.stock,0),availableSizes:available.map(r=>String(r.talla)),sizeInventory:rows};});
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
  const scoped = products.filter(p => Number(p.stock) > 0 && (() => {
    const sameCategory = activeCategory === "Todos" ||
      String(p.category || "").trim().toLowerCase() === categoryKey;
    const sameBrand = activeBrand === "Todas" ||
      String(p.brand || "").trim().toLowerCase() === brandKey;
    return sameCategory && sameBrand;
  })());
  const sizes = uniqueNormalized(scoped.flatMap(p=>p.availableSizes||sizesOf(p.talla)))
    .sort((a,b)=>a.localeCompare(b,"es",{numeric:true,sensitivity:"base"}));
  return sizes.length ? ["Todas", ...sizes] : [];
}

let cart = JSON.parse(localStorage.getItem("jsCart") || "[]");
function saveCart(){localStorage.setItem("jsCart",JSON.stringify(cart));}
function saveFavorites(){localStorage.setItem("jsFavorites",JSON.stringify(favorites));}
function favoriteCount(){return favorites.length;}
function updateFavoriteCount(){const el=document.getElementById("favoriteCount");if(el)el.textContent=favoriteCount();}
function toggleFavorite(id){const key=String(id);if(favorites.includes(key))favorites=favorites.filter(x=>String(x)!==key);else favorites.push(key);saveFavorites();updateFavoriteCount();renderFavorites();renderStore();}
function renderFavorites(){
 favorites=favorites.filter(id=>products.some(p=>String(p.id)===String(id)));saveFavorites();updateFavoriteCount();const el=document.getElementById("favoriteItems");if(!el)return;
 if(!favorites.length){el.innerHTML='<p class="empty">Aún no tienes productos favoritos.</p>';return;}
 el.innerHTML=favorites.map(id=>{const p=products.find(x=>String(x.id)===String(id));if(!p)return '';return `<div class="favorite-line"><div class="favorite-line-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Sin foto</span>'}</div><div class="favorite-line-info"><b>${esc(p.name)}</b><small>${money(p.price)} · ${p.stock>0?`${p.stock} disponibles`:'Agotado'}</small><div class="favorite-line-actions"><button class="favorite-add" onclick="add(${p.id})" ${p.stock<=0?'disabled':''}>Agregar al carrito</button><button class="favorite-remove" onclick="toggleFavorite(${p.id})">Quitar</button></div></div></div>`}).join('');
}
function productSizes(p){return Array.isArray(p.availableSizes)?p.availableSizes:sizesOf(p.talla);}
function stockForSize(p,size){if(Array.isArray(p.sizeInventory))return Number(p.sizeInventory.find(r=>String(r.talla).toLowerCase()===String(size).toLowerCase())?.stock)||0;return Number(p.stock)||0;}
function add(id,size){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;const sizes=productSizes(p).filter(s=>stockForSize(p,s)>0);
 if(p.sizeInventory&&!size){if(sizes.length===1)size=sizes[0];else if(sizes.length>1){openDetail(id);return;}}
 if(!size&&sizes.length)size=sizes[0];const available=p.sizeInventory?stockForSize(p,size):Number(p.stock)||0;
 if(available<=0){alert("Esta talla está agotada por el momento.");return;}
 const key=`${p.id}::${size||''}`;const x=cart.find(i=>String(i.key||`${i.id}::${i.size||''}`)===key);
 if(x){if(Number(x.qty)>=available){alert("No puedes agregar más unidades de esta talla que las disponibles.");return;}x.qty++;}else cart.push({id:p.id,size:size||"",key,qty:1});saveCart();renderCart();openCart();
}
function qty(keyOrId,d){const x=cart.find(i=>String(i.key||`${i.id}::${i.size||''}`)===String(keyOrId)||String(i.id)===String(keyOrId));if(!x)return;const p=products.find(item=>String(item.id)===String(x.id));if(!p)return;const available=p.sizeInventory?stockForSize(p,x.size):Number(p.stock)||0;if(d>0&&(available<=0||Number(x.qty)>=available)){alert(available<=0?"Esta talla está agotada.":"Ya tienes en el carrito todas las unidades disponibles de esta talla.");return;}x.qty+=d;if(x.qty<1)cart=cart.filter(i=>i!==x);saveCart();renderCart();}
function removeFromCart(keyOrId){cart=cart.filter(i=>String(i.key||`${i.id}::${i.size||''}`)!==String(keyOrId)&&String(i.id)!==String(keyOrId));saveCart();renderCart();}
function openCart(){document.getElementById("cart").classList.add("open");document.getElementById("shade").classList.add("open");}
function closeCart(){document.getElementById("cart").classList.remove("open");document.getElementById("shade").classList.remove("open");}
function renderCart(){
 const el=document.getElementById("cartItems");if(!el)return;
 cart=cart.filter(i=>products.some(p=>String(p.id)===String(i.id)));
 el.innerHTML=cart.length?cart.map(i=>{
  const p=products.find(x=>String(x.id)===String(i.id));
  const key=String(i.key||`${i.id}::${i.size||''}`);
  const subtotal=(Number(p.price)||0)*(Number(i.qty)||0);
  return `<div class="cart-line"><div class="cart-line-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Sin foto</span>'}</div><div class="cart-line-info"><b>${esc(p.name)}</b>${i.size?`<small>Talla: ${esc(i.size)}</small>`:''}<small>${money(p.price)} c/u</small><strong class="cart-line-subtotal">Subtotal: ${money(subtotal)}</strong><button class="cart-remove" onclick="removeFromCart('${key}')">Eliminar</button></div><div class="cart-line-actions"><div class="qty"><button onclick="qty('${key}',-1)" aria-label="Disminuir cantidad">−</button><b>${i.qty}</b><button onclick="qty('${key}',1)" aria-label="Aumentar cantidad">+</button></div></div></div>`
 }).join(""):'<p class="empty">Tu carrito está vacío.</p>';
 const total=cart.reduce((sum,i)=>{const p=products.find(x=>String(x.id)===String(i.id));return p?sum+(Number(p.price)||0)*(Number(i.qty)||0):sum},0);
 document.getElementById("total").textContent=money(total);document.getElementById("count").textContent=cart.reduce((sum,i)=>sum+i.qty,0);saveCart();
}
function sendOrder(){
  if(!cart.length)return alert("Agrega productos al carrito.");
  const unavailable=cart.map(item=>({item,product:products.find(p=>String(p.id)===String(item.id))})).find(({item,product})=>!product||(product.sizeInventory?stockForSize(product,item.size)<Number(item.qty):Number(product.stock)<Number(item.qty)));
  if(unavailable){alert("Hay una talla agotada o una cantidad superior a su existencia. Actualiza tu carrito antes de continuar.");return;}
  let total=0,msg="Hola, JS Trendy Shop. Quiero realizar el siguiente pedido:\n\n";
  cart.forEach(i=>{const p=products.find(x=>String(x.id)===String(i.id));if(!p)return;total+=p.price*i.qty;msg+=`• ${p.name}${i.size?` (talla ${i.size})`:''} x${i.qty} — ${money(p.price*i.qty)}\n`;if(p.image)msg+=`📸 Foto del producto: https://jstrendyshop.com/f.html?id=${encodeURIComponent(p.id)}\n`;});
  msg+=`\nTotal: ${money(total)}\n\n¿Me confirman disponibilidad?`;
  const wa=localStorage.getItem("jsWhatsApp")||"526624262742";window.open("https://wa.me/"+wa+"?text="+encodeURIComponent(msg),"_blank");
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
    Number(p.stock)>0 &&
    (activeCategory==="Todos"||String(p.category||"").trim().toLowerCase()===String(activeCategory||"").trim().toLowerCase()) &&
    (activeBrand==="Todas"||String(p.brand||"").trim().toLowerCase()===String(activeBrand).trim().toLowerCase()) &&
    (activeSize==="Todas"||(p.availableSizes||sizesOf(p.talla)).some(size => String(size).trim().toLowerCase()===String(activeSize).trim().toLowerCase())) && matches(p,query)
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
    const sizes=productSizes(p).filter(size=>stockForSize(p,size)>0);
    return `<article class="product catalog-product-card"><div class="pic">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'Foto del producto'}${p.offer?'<span class="offer-badge">OFERTA</span>':''}<button type="button" class="product-heart ${favorites.includes(String(p.id))?'is-favorite':''}" aria-label="${favorites.includes(String(p.id))?'Quitar de favoritos':'Agregar a favoritos'}" title="${favorites.includes(String(p.id))?'Quitar de favoritos':'Favorito'}" onclick="event.stopPropagation();toggleFavorite(${p.id})">${favorites.includes(String(p.id))?'♥':'♡'}</button></div><div class="product-body"><div class="tag">${esc(p.brand||p.category)}${p.category&&p.brand?' · '+esc(p.category):''}</div><h3>${esc(p.name)}</h3>${p.model?`<p class="model-line">Modelo: <b>${esc(p.model)}</b></p>`:''}${sizes.length?`<div class="size-list"><span>Tallas:</span>${sizes.slice(0,5).map(s=>`<b>${esc(s)}</b>`).join('')}</div>`:''}<div class="product-bottom"><div class="price">${money(p.price)}</div><small>${p.stock>0?`${p.stock} disponibles`:'Agotado'}</small></div><button class="secondary catalog-add" onclick="openDetail(${p.id})">Ver producto</button></div></article>`;
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
  const allOffers=products.filter(p=>p.offer && Number(p.stock)>0);
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
    const sizes=productSizes(p).filter(size=>stockForSize(p,size)>0);
    const categoryLabel=p.category||"Producto";
    return `<article class="product offer-product-card"><div class="pic">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'Foto del producto'}<span class="offer-badge">OFERTA</span></div><div class="product-body"><div class="tag">${esc(p.brand||categoryLabel)}${p.category&&p.brand?' · '+esc(p.category):''}</div><h3>${esc(p.name)}</h3>${p.model?`<p class="model-line">Modelo: <b>${esc(p.model)}</b></p>`:''}${sizes.length?`<div class="size-list"><span>Tallas:</span>${sizes.slice(0,5).map(x=>`<b>${esc(x)}</b>`).join('')}</div>`:''}<div class="product-bottom"><div>${offerPriceMarkup(p)}</div><small>${p.stock>0?`${p.stock} disponibles`:'Agotado'}</small></div><div class="product-actions"><button class="secondary" onclick="openDetail(${p.id})">Ver producto</button><button class="add" onclick="openDetail(${p.id})" ${p.stock<=0?'disabled':''}>Agregar</button></div></div></article>`;
  }).join('');
}

function openDetail(id){
 detailId=id;const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 const sizes=productSizes(p).filter(size=>stockForSize(p,size)>0);
 const hasSizeInventory=Array.isArray(p.sizeInventory);
 const sizeControl=sizes.length?`<label class="public-size-picker">Selecciona talla<select id="detailSize" onchange="updateDetailAvailability(${p.id})">${sizes.map(size=>`<option value="${esc(size)}">${esc(size)}${hasSizeInventory?` — ${stockForSize(p,size)} disponibles`:''}</option>`).join('')}</select></label>`:'';
 const initialStock=hasSizeInventory?(sizes.length?stockForSize(p,sizes[0]):0):Number(p.stock)||0;
 const qtyControl=initialStock>0?`<label class="detail-quantity-label">Cantidad<select id="detailQty">${Array.from({length:Math.min(initialStock,30)},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label>`:'';
 const disabled=initialStock<=0?'disabled':'';
 document.getElementById("detailContent").innerHTML=`<div class="detail-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'<span>Sin imagen</span>'}</div><div class="detail-info"><div class="tag">${esc(p.brand||p.category||'Producto')}${p.category&&p.brand?' · '+esc(p.category):''}</div><h2>${esc(p.name)}</h2>${p.model?`<p><b>Modelo:</b> ${esc(p.model)}</p>`:''}<p>${esc(p.desc||'Producto seleccionado de JS Trendy Shop.')}</p>${sizeControl}${qtyControl}<div class="detail-price">${offerPriceMarkup(p,"detail-offer-price")}</div><p class="stock-note" id="detailStockNote">${initialStock>0?`${initialStock} disponibles en la talla seleccionada`:'Actualmente agotado'}</p><div class="detail-actions"><button class="btn full" onclick="addFromDetail(${p.id})" ${disabled}>Agregar al carrito</button><button class="whatsapp-order-btn full" onclick="orderProductWhatsApp(${p.id})" ${disabled}>Pedir a domicilio por WhatsApp</button></div></div>`;
 document.getElementById("detailModal").classList.remove("hidden");
}
function updateDetailAvailability(id){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 const size=document.getElementById('detailSize')?.value||'';
 const available=Array.isArray(p.sizeInventory)?stockForSize(p,size):Number(p.stock)||0;
 const qty=document.getElementById('detailQty');
 if(qty){const current=Math.max(1,Number(qty.value)||1);qty.innerHTML=Array.from({length:Math.min(available,30)},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');if(available>0)qty.value=String(Math.min(current,available));}
 const note=document.getElementById('detailStockNote');if(note)note.textContent=available>0?`${available} disponibles en la talla seleccionada`:'Talla agotada';
 document.querySelectorAll('#detailContent .detail-actions button').forEach(btn=>btn.disabled=available<=0);
}
function addFromDetail(id){const size=document.getElementById('detailSize')?.value||'';const amount=Math.max(1,Number(document.getElementById('detailQty')?.value)||1);for(let i=0;i<amount;i++){const before=cart.reduce((n,x)=>n+(String(x.id)===String(id)&&String(x.size||'')===String(size)?Number(x.qty):0),0);const p=products.find(x=>String(x.id)===String(id));const available=p?(Array.isArray(p.sizeInventory)?stockForSize(p,size):Number(p.stock)||0):0;if(before>=available){alert('No hay suficientes existencias para esa cantidad.');break;}add(id,size);}closeDetail();}
function orderProductWhatsApp(id){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 const size=document.getElementById('detailSize')?.value||'';
 const qty=Math.max(1,Number(document.getElementById('detailQty')?.value)||1);
 const available=Array.isArray(p.sizeInventory)?stockForSize(p,size):Number(p.stock)||0;
 if(available<qty){alert('La talla seleccionada ya no tiene suficientes existencias. Actualiza el catálogo e inténtalo de nuevo.');return;}
 const subtotal=(Number(p.price)||0)*qty;
 const msg=`Hola, JS Trendy Shop. Quiero pedir a domicilio:\n\n• ${p.name}${size?` (talla ${size})`:''} x${qty} — ${money(subtotal)}\n\nTotal de productos: ${money(subtotal)}\nEntrega a domicilio: por confirmar\n\n¿Me confirman disponibilidad y costo de entrega?`;
 const wa=localStorage.getItem('jsWhatsApp')||'526624262742';window.open('https://wa.me/'+wa+'?text='+encodeURIComponent(msg),'_blank');
}
function closeDetail(){document.getElementById("detailModal").classList.add("hidden");detailId=null;}

async function startStore(){
  if(!document.getElementById("products"))return;
  document.getElementById("search").oninput=renderStore;
  document.getElementById("catalogSort")?.addEventListener("change",e=>{catalogSort=e.target.value;renderStore();});
  document.getElementById("cartBtn").onclick=openCart;
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
    const expanded=wrap.classList.toggle("is-expanded");
    allCategoriesBtn.setAttribute("aria-expanded",String(expanded));
    allCategoriesBtn.innerHTML=expanded?'Mostrar menos <span>−</span>':'Ver todas las categorías <span>＋</span>';
  });
  const allBrandsBtn=document.querySelector('[data-view-all-brands]');
  allBrandsBtn?.addEventListener("click",()=>{
    const wrap=document.getElementById("featuredBrands");
    if(!wrap) return;
    const expanded=wrap.classList.toggle("is-expanded");
    allBrandsBtn.setAttribute("aria-expanded",String(expanded));
    allBrandsBtn.innerHTML=expanded?'Mostrar menos marcas <span>−</span>':'Ver todas las marcas <span>＋</span>';
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
  await loadCategoryBrandRules();
  renderFavorites();
  await loadVisualCatalogConfig();
  renderStore();
}
startStore();
