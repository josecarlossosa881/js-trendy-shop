let editingId = null;

const $ = id => document.getElementById(id);

const DEFAULT_CATS = ["Todos","Bolsas","Carteras","Calzado","Ropa","Perfumes","Accesorios"];
const STORAGE_BUCKET = "productos";
const VISUAL_CATEGORY_BUCKET = STORAGE_BUCKET;

async function getVisualCategories(){
  const {data,error}=await supabaseClient.from("tienda_categorias").select("id,nombre,etiqueta,imagen,activo,orden").order("orden",{ascending:true}).order("id",{ascending:true});
  if(error) throw new Error(error.message);
  return data||[];
}
async function getVisualBrands(){
  const {data,error}=await supabaseClient.from("tienda_marcas").select("id,nombre,imagen,activo,destacada,orden").order("orden",{ascending:true}).order("id",{ascending:true});
  if(error) throw new Error(error.message);
  return data||[];
}
async function uploadVisualImage(file){
  if(!file) return "";
  if(!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
  const extension=(file.name.split(".").pop()||"jpg").toLowerCase();
  const path=`visual-${crypto.randomUUID()}-${safeFileName(file.name)||`imagen.${extension}`}`;
  const {error}=await supabaseClient.storage.from(VISUAL_CATEGORY_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error) throw new Error(error.message);
  return publicImageUrl(path);
}
function nextVisualOrder(items){
  const max = (items||[]).reduce((m,item)=>Math.max(m, Number(item.orden)||0), 0);
  return max + 1;
}

function setNextVisualOrders(cats, brands){
  const catOrder=$("visualCatOrder");
  const brandOrder=$("visualBrandOrder");
  if(catOrder) catOrder.value=String(nextVisualOrder(cats));
  if(brandOrder) brandOrder.value=String(nextVisualOrder(brands));
}

async function syncLocalCategoriesFromVisual(){
  const cats = await getVisualCategories();
  const active = cats.filter(c=>c.activo).sort((a,b)=>(Number(a.orden)||0)-(Number(b.orden)||0));
  const saved = getCats().filter(c=>c && c !== "Todos");
  const names = [...DEFAULT_CATS.filter(c=>c !== "Todos"), ...saved, ...active.map(c=>c.nombre)];
  const unique = [...new Map(names.map(c=>[String(c).trim().toLocaleLowerCase(),String(c).trim()])).values()].filter(Boolean);
  saveCats(["Todos", ...unique]);
  return cats;
}

// Combina las categorías predeterminadas, las guardadas localmente, las activas
// de Supabase y las usadas por productos para que el selector nunca se quede corto.
async function getAllCategoryNames(){
  const names = [...DEFAULT_CATS.filter(c=>c !== "Todos"), ...getCats().filter(c=>c && c !== "Todos")];
  try {
    const visual = await getVisualCategories();
    names.push(...visual.filter(c=>c.activo).sort((a,b)=>(Number(a.orden)||0)-(Number(b.orden)||0)).map(c=>c.nombre));
  } catch(error) {
    console.warn("No se pudieron cargar categorías de Supabase:", error.message);
  }
  try {
    const {data,error}=await supabaseClient.from("productos").select("categoria");
    if(!error) names.push(...(data||[]).map(p=>p.categoria));
  } catch(error) {
    console.warn("No se pudieron cargar categorías de productos:", error.message);
  }
  const unique=[...new Map(names.map(value=>{
    const name=String(value||"").trim();
    return [name.toLocaleLowerCase(),name];
  }).filter(([key])=>key)).values()];
  saveCats(["Todos", ...unique]);
  return unique;
}

async function renderVisualConfig(){
  const catWrap=$("visualCategoriesList");
  const brandWrap=$("visualBrandsList");
  try{
    const [cats,brands]=await Promise.all([getVisualCategories(),getVisualBrands()]);
    setNextVisualOrders(cats, brands);

    if(catWrap){
      catWrap.innerHTML = cats.map(c=>`<div class="admin-item"><img src="${c.imagen||''}" alt=""><div class="grow"><b>${c.etiqueta||c.nombre}</b><br><small>Destino: ${c.nombre} · Orden ${c.orden}</small></div><button onclick="toggleVisualCategory(${c.id},${!c.activo})">${c.activo?'Ocultar':'Mostrar'}</button></div>`).join("") || '<div class="empty">No hay categorías visuales.</div>';
    }
    if(brandWrap){
      brandWrap.innerHTML = brands.map(b=>`<div class="admin-item"><img src="${b.imagen||''}" alt=""><div class="grow"><b>${b.nombre}</b><br><small>Orden ${b.orden} · ${b.destacada?'Destacada':'No destacada'}</small></div><button onclick="toggleVisualBrand(${b.id},${!b.activo})">${b.activo?'Ocultar':'Mostrar'}</button></div>`).join("") || '<div class="empty">No hay marcas visuales.</div>';
    }
  }catch(error){
    const msg=`<div class="empty">Primero ejecuta tienda_visual.sql en Supabase. ${error.message}</div>`;
    if(catWrap) catWrap.innerHTML=msg;
    if(brandWrap) brandWrap.innerHTML=msg;
  }
}
async function toggleVisualCategory(id,activo){
  const {error}=await supabaseClient.from("tienda_categorias").update({activo}).eq("id",id);
  if(error) return alert(error.message);
  await renderVisualConfig();
}
async function toggleVisualBrand(id,activo){
  const {error}=await supabaseClient.from("tienda_marcas").update({activo}).eq("id",id);
  if(error) return alert(error.message);
  await renderVisualConfig();
}
async function addVisualCategory(){
  const nombre=$("visualCatName").value.trim();
  const etiqueta=$("visualCatLabel").value.trim()||nombre;
  const orden=Math.max(0,Number($("visualCatOrder").value)||1);
  if(!nombre) return alert("Escribe el nombre de la categoría.");
  try{
    let imagen="";
    const file=$("visualCatImage").files[0];
    if(file) imagen=await uploadVisualImage(file);
    const {error}=await supabaseClient.from("tienda_categorias").insert({nombre,etiqueta,imagen,orden,activo:true});
    if(error) throw error;
    $("visualCatName").value=""; $("visualCatLabel").value=""; $("visualCatImage").value="";
    await syncLocalCategoriesFromVisual();
    await renderCategoryBrands();
    await renderVisualConfig();
    alert("Categoría visual agregada. ✅");
  }catch(error){ alert("No se pudo agregar: "+error.message); }
}
async function addVisualBrand(){
  const nombre=$("visualBrandName").value.trim();
  const orden=Math.max(0,Number($("visualBrandOrder").value)||1);
  const destacada=$("visualBrandFeatured").checked;
  if(!nombre) return alert("Escribe el nombre de la marca.");
  try{
    let imagen="";
    const file=$("visualBrandImage").files[0];
    if(file) imagen=await uploadVisualImage(file);
    const {error}=await supabaseClient.from("tienda_marcas").insert({nombre,imagen,orden,destacada,activo:true});
    if(error) throw error;
    $("visualBrandName").value=""; $("visualBrandImage").value="";
    await renderVisualConfig();
    alert("Marca agregada. ✅");
  }catch(error){ alert("No se pudo agregar: "+error.message); }
}

// Botones de categorías y marcas visuales
const saveVisualCatBtn = $("saveVisualCat");
if(saveVisualCatBtn) saveVisualCatBtn.addEventListener("click", addVisualCategory);

const saveVisualBrandBtn = $("saveVisualBrand");
if(saveVisualBrandBtn) saveVisualBrandBtn.addEventListener("click", addVisualBrand);

function money(n){
  return n ? "$" + Number(n).toLocaleString("es-MX") : "Consultar";
}

function uiProduct(row){
  return {
    id: row.id,
    name: row.nombre || "",
    price: Number(row.precio) || 0,
    category: row.categoria || "",
    brand: row.marca || "",
    model: row.modelo || "",
    subcategory: row.subcategoria || "",
    desc: row.descripcion || "",
    offer: !!row.oferta,
    image: row.imagen || "",
    talla: row.talla || "",
    stock: Number(row.stock) || 0,
    activo: row.activo !== false
  };
}

async function getProducts(){
  const { data, error } = await supabaseClient
    .from("productos")
    .select("*")
    .order("id", { ascending: false });

  if(error) throw new Error(error.message);
  return (data || []).map(uiProduct);
}

function getCats(){
  const saved = JSON.parse(localStorage.getItem("jsCats") || "null");
  return saved || DEFAULT_CATS;
}

function saveCats(x){
  localStorage.setItem("jsCats", JSON.stringify(x));
}

async function getCategoryBrandRules(){
  const { data, error } = await supabaseClient
    .from("categoria_marcas")
    .select("id,categoria,marca,activo")
    .order("id", { ascending: true });
  if(error) throw new Error(error.message);
  return data || [];
}

async function getBrandsForCategory(category){
  const name = String(category || "").trim();
  if(!name) return [];
  const { data, error } = await supabaseClient
    .from("categoria_marcas")
    .select("marca,activo")
    .eq("categoria", name)
    .eq("activo", true)
    .order("id", { ascending: true });
  if(error) throw new Error(error.message);
  return (data || []).map(x => String(x.marca || "").trim()).filter(Boolean);
}

async function fillBrandOptions(selected = ""){
  const select = $("pBrand");
  if(!select) return;
  const category = $("pCat").value;
  try{
    const brands = await getBrandsForCategory(category);
    select.innerHTML = brands.length
      ? `<option value="">Selecciona una marca</option>` + brands.map(b => `<option value="${b.replaceAll('"','&quot;')}">${b}</option>`).join("")
      : `<option value="">Primero configura las marcas de esta categoría</option>`;
    const match = brands.find(b => b.toLowerCase() === String(selected || "").toLowerCase());
    select.value = match || "";
  }catch(error){
    console.error(error);
    select.innerHTML = `<option value="">No se pudieron cargar las marcas</option>`;
  }
}

async function saveCategoryBrands(category, brandsText){
  const categoryName = String(category || "").trim();
  const brands = [];
  String(brandsText || "").split(",").forEach(v=>{
    const label=v.trim();
    if(label && !brands.some(x=>x.toLowerCase()===label.toLowerCase())) brands.push(label);
  });

  const { error: delError } = await supabaseClient
    .from("categoria_marcas")
    .delete()
    .eq("categoria", categoryName);
  if(delError) throw new Error(delError.message);

  if(brands.length){
    const rows=brands.map(marca=>({categoria:categoryName,marca,activo:true}));
    const { error: insError } = await supabaseClient.from("categoria_marcas").insert(rows);
    if(insError) throw new Error(insError.message);
  }
}

async function renderCategoryBrands(){
  const list=$("catList");
  const cats=await getAllCategoryNames();
  let rules=[];
  try{ rules=await getCategoryBrandRules(); }
  catch(error){
    list.innerHTML=`<div class="empty">No se pudo cargar la configuración de marcas: ${error.message}</div>`;
    return;
  }
  const grouped={};
  rules.forEach(r=>{
    const key=String(r.categoria||"").toLowerCase();
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push(r.marca);
  });
  list.innerHTML=cats.map(c=>{
    const values=grouped[c.toLowerCase()]||[];
    return `<div class="admin-item" style="display:block">
      <div style="font-weight:700;margin-bottom:8px">${c}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input id="brands_${encodeURIComponent(c)}" class="search" style="flex:1;min-width:240px" value="${values.join(", ").replaceAll('"','&quot;')}" placeholder="Ej. Guess, Steve Madden, Michael Kors">
        <button class="btn" onclick="saveBrandsForCategory('${c.replaceAll("'","\'")}')">Guardar marcas</button>
      </div>
      <small class="hint">Solo las marcas escritas aquí podrán aparecer en esta categoría.</small>
    </div>`;
  }).join("") || '<div class="empty">Agrega una categoría primero.</div>';
}

async function saveBrandsForCategory(category){
  const input=$("brands_"+encodeURIComponent(category));
  try{
    await saveCategoryBrands(category, input?.value || "");
    alert("Marcas guardadas para " + category + ".");
    await renderCategoryBrands();
    try{
      const visualCats = await getVisualCategories();
      if(visualCats.length){
        saveCats(["Todos", ...visualCats.filter(c=>c.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)).map(c=>c.nombre)]);
      }
    }catch(e){
      console.warn("No se pudo sincronizar el catálogo de categorías visuales:", e.message);
    }
    await renderVisualConfig();
  }catch(error){
    console.error(error);
    alert("No se pudieron guardar las marcas: " + error.message);
  }
}

function renderImage(url, name){
  return url
    ? `<img src="${url}" alt="${name}" style="width:100%;height:100%;object-fit:cover">`
    : "";
}

async function renderAdmin(){
  try{
    const ps = (await getProducts()).filter(p => p.activo);

    $("adminProducts").innerHTML = ps.map(p => `
      <div class="admin-item">
        <div class="pic" style="width:65px;height:65px">
          ${renderImage(p.image, p.name)}
        </div>
        <div class="grow">
          <b>${p.name}</b><br>
          <small>${p.brand ? p.brand + " · " : ""}${p.category || "Sin categoría"}${p.model ? " · " + p.model : ""} · ${money(p.price)} · Tallas: ${p.talla || "—"} · Stock: ${p.stock}</small>
        </div>
        <button onclick="editProduct(${p.id})">Editar</button>
        <button onclick="deleteProduct(${p.id})">Archivar</button>
      </div>
    `).join("") || '<div class="empty">Todavía no tienes productos.</div>';

    await renderCategoryBrands();
  }catch(error){
    console.error(error);
    $("adminProducts").innerHTML =
      `<div class="empty">No se pudieron cargar los productos: ${error.message}</div>`;
  }
}

async function fillCats(selected = ""){
  const cs = await getAllCategoryNames();
  const wanted = String(selected || "").trim();
  if(wanted && !cs.some(c=>c.toLocaleLowerCase()===wanted.toLocaleLowerCase())) cs.unshift(wanted);
  const escapeHtml = value => String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  $("pCat").innerHTML = cs.map(c =>
    `<option value="${escapeHtml(c)}" ${c.toLocaleLowerCase() === wanted.toLocaleLowerCase() ? "selected" : ""}>${escapeHtml(c)}</option>`
  ).join("");
  if(!cs.length) $("pCat").innerHTML = `<option value="">Sin categoría</option>`;
}

function showPreview(url){
  const preview = $("pImagePreview");
  if(url){
    preview.innerHTML = `<img src="${url}" alt="Vista previa">`;
  }else{
    preview.textContent = "Sin imagen";
  }
}

function publicImageUrl(path){
  return supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function storagePathFromPublicUrl(url){
  if(!url) return null;

  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = url.indexOf(marker);

  if(index === -1) return null;

  return decodeURIComponent(url.slice(index + marker.length));
}

function safeFileName(name){
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function uploadProductImage(file){
  if(!file) return null;

  if(!file.type.startsWith("image/")){
    throw new Error("El archivo seleccionado no es una imagen.");
  }

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}-${safeFileName(file.name) || `imagen.${extension}`}`;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if(error) throw new Error(error.message);

  return {
    path,
    url: publicImageUrl(path)
  };
}

async function deleteStorageImage(url){
  const path = storagePathFromPublicUrl(url);
  if(!path) return;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  if(error){
    console.warn("No se pudo borrar la imagen anterior:", error);
  }
}

async function openModal(id = null){
  editingId = id;
  $("modal").classList.remove("hidden");
  $("modalTitle").textContent = id ? "Editar producto" : "Agregar producto";
  $("uploadStatus").textContent = "";
  $("pImage").value = "";

  let p = null;

  if(id){
    try{
      const { data, error } = await supabaseClient
        .from("productos")
        .select("*")
        .eq("id", id)
        .single();

      if(error) throw error;
      p = uiProduct(data);
    }catch(error){
      alert("No se pudo cargar el producto: " + error.message);
      $("modal").classList.add("hidden");
      editingId = null;
      return;
    }
  }

  await fillCats(p?.category || getCats()[1] || "");

  $("pName").value = p?.name || "";
  $("pPrice").value = p?.price ?? "";
  $("pPreviousPrice").value = p?.previousPrice ?? "";
  await fillBrandOptions(p?.brand || "");
  $("pModel").value = p?.model || "";
  $("pSubcategory").value = p?.subcategory || "";
  $("pTalla").value = p?.talla || "";
  $("pStock").value = p?.stock ?? 1;
  $("pDesc").value = p?.desc || "";
  $("pOffer").checked = !!p?.offer;
  $("pImage").dataset.currentUrl = p?.image || "";

  showPreview(p?.image || "");

  const hasSizes = !!(p?.talla || "").trim();
  $("pHasSizes").checked = hasSizes;
  $("sizeFields").style.display = hasSizes ? "" : "none";
}

$("newProduct").onclick = () => openModal();

$("pCat").addEventListener("change", async () => {
  await fillBrandOptions("");
});

$("pHasSizes").addEventListener("change", () => {
  const enabled = $("pHasSizes").checked;
  $("sizeFields").style.display = enabled ? "" : "none";
  if(!enabled) $("pTalla").value = "";
});

$("modalClose").onclick = () => {
  $("modal").classList.add("hidden");
  editingId = null;
};

$("pImage").addEventListener("change", () => {
  const file = $("pImage").files[0];
  if(!file){
    showPreview($("pImage").dataset.currentUrl || "");
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  showPreview(previewUrl);
  $("uploadStatus").textContent = "La imagen se subirá al guardar el producto.";
});

$("saveProduct").onclick = async () => {
  const name = $("pName").value.trim();

  if(!name){
    alert("Escribe un nombre.");
    return;
  }

  const button = $("saveProduct");
  button.disabled = true;
  button.textContent = "Guardando...";
  $("uploadStatus").textContent = "";

  let uploadedImage = null;
  let oldImageUrl = "";

  try{
    if(editingId){
      const { data, error } = await supabaseClient
        .from("productos")
        .select("imagen")
        .eq("id", editingId)
        .single();

      if(error) throw error;
      oldImageUrl = data?.imagen || "";
    }

    const file = $("pImage").files[0];

    if(file){
      $("uploadStatus").textContent = "Subiendo imagen...";
      uploadedImage = await uploadProductImage(file);
    }

    const product = {
      nombre: name,
      descripcion: $("pDesc").value.trim(),
      precio: Number($("pPrice").value) || 0,
      precio_anterior: Number($("pPreviousPrice").value) || 0,
      categoria: $("pCat").value || "",
      marca: $("pBrand").value.trim(),
      modelo: $("pModel").value.trim(),
      subcategoria: $("pSubcategory").value.trim(),
      talla: $("pHasSizes").checked ? $("pTalla").value.trim() : "",
      stock: Math.max(0, Number($("pStock").value) || 0),
      activo: true,
      oferta: $("pOffer").checked
    };

    if(uploadedImage){
      product.imagen = uploadedImage.url;
    }

    if(editingId){
      const { error } = await supabaseClient
        .from("productos")
        .update(product)
        .eq("id", editingId);

      if(error){
        if(uploadedImage) await deleteStorageImage(uploadedImage.url);
        throw error;
      }

      if(uploadedImage && oldImageUrl){
        await deleteStorageImage(oldImageUrl);
      }
    }else{
      if(!uploadedImage){
        product.imagen = "";
      }

      const { error } = await supabaseClient
        .from("productos")
        .insert(product);

      if(error){
        if(uploadedImage) await deleteStorageImage(uploadedImage.url);
        throw error;
      }
    }

    $("modal").classList.add("hidden");
    editingId = null;
    await renderAdmin();
    alert("Producto guardado correctamente. ✅");
  }catch(error){
    console.error(error);
    $("uploadStatus").textContent = "";
    alert("No se pudo guardar el producto: " + error.message);
  }finally{
    button.disabled = false;
    button.textContent = "Guardar producto";
  }
};

async function editProduct(id){
  await openModal(id);
}

async function deleteProduct(id){
  const p = (await getProducts()).find(x => String(x.id) === String(id));
  if(!p) return alert("No se encontró el producto.");
  if(!confirm(`¿Archivar “${p.name}”?\n\nDejará de aparecer en el catálogo, pero se conservará con su inventario e historial para poder recuperarlo.`)) return;
  try{
    const { error } = await supabaseClient.from("productos").update({activo:false}).eq("id",id);
    if(error) throw error;
    try{ await logInventoryMovement({product:p,type:"archivo",quantity:0,before:p.stock,after:p.stock,reason:"Producto archivado"}); }
    catch(logError){ alert(logError.message); }
    await renderAdmin();
    await renderInventory();
    await renderArchived();
    alert("Producto archivado. Puedes recuperarlo desde Productos archivados.");
  }catch(error){
    console.error(error);
    alert("No se pudo archivar el producto: " + error.message);
  }
}

function inventoryProductMarkup(p, archived=false){
  const sizeText = (p.talla || "").trim() || "Sin tallas registradas";
  const status = Number(p.stock) > 0 ? `${p.stock} unidades` : "Sin existencia";
  return `<div class="admin-item inventory-row">
    <div class="pic" style="width:65px;height:65px;flex:0 0 65px">${renderImage(p.image,p.name)}</div>
    <div class="grow"><b>${p.name}</b><br><small>${p.brand ? p.brand+" · " : ""}${p.category || "Sin categoría"}${p.model ? " · "+p.model : ""}</small><br><small>Tallas: ${sizeText}</small><br><small><b>Existencia: ${status}</b></small></div>
    ${archived ? `<button onclick="restoreProduct(${p.id})">Recuperar</button><button class="danger" onclick="permanentlyDeleteProduct(${p.id})">Eliminar</button>` : `<button onclick="changeProductStock(${p.id},'entrada')">+ Entrada</button><button onclick="changeProductStock(${p.id},'ajuste')">Ajustar</button><button onclick="deleteProduct(${p.id})">Archivar</button>`}
  </div>`;
}

async function ensureSizeRows(product){
  const sizes=(product.talla||"").split(/[,/|]+/).map(x=>x.trim()).filter(Boolean);
  if(!sizes.length) return;
  const {data,error}=await supabaseClient.from("inventario_tallas").select("talla").eq("producto_id",product.id);
  if(error) throw error;
  const existing=new Set((data||[]).map(x=>String(x.talla).toLowerCase()));
  const missing=sizes.filter(s=>!existing.has(s.toLowerCase()));
  if(missing.length){const {error:e}=await supabaseClient.from("inventario_tallas").insert(missing.map(talla=>({producto_id:product.id,talla,stock:0,vendidas:0})));if(e)throw e;}
}
async function renderSizeInventory(){
 const wrap=$("sizeInventoryTable"); if(!wrap)return;
 try{
  const query=String($("inventorySearch")?.value||"").trim().toLowerCase();
  const products=(await getProducts()).filter(p=>p.activo);
  for(const p of products) await ensureSizeRows(p);
  const {data,error}=await supabaseClient.from("inventario_tallas").select("id,producto_id,talla,stock,vendidas").order("producto_id").order("talla");
  if(error)throw error;
  const rows=(data||[]).map(r=>({...r,product:products.find(p=>String(p.id)===String(r.producto_id))})).filter(r=>r.product).filter(r=>String(r.product.talla||"").split(/[,/|]+/).map(x=>x.trim().toLowerCase()).includes(String(r.talla||"").trim().toLowerCase())).filter(r=>[r.product.name,r.product.brand,r.product.category,r.product.model,r.product.talla,r.talla].join(" ").toLowerCase().includes(query));
  if(!rows.length){wrap.innerHTML='<div class="empty" style="padding:22px">No hay tallas que coincidan con la búsqueda. Revisa que el producto tenga tallas registradas.</div>';return;}
  wrap.innerHTML=`<table class="size-inventory-table"><thead><tr><th>Imagen</th><th>Producto</th><th>Talla</th><th>Stock</th><th>Vendidas</th><th>Acciones</th></tr></thead><tbody>${rows.map(r=>{
    const p=r.product;
    const photo=p.image?`<img src="${p.image}" alt="Imagen de ${p.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\'inventory-empty-photo\'>Sin foto</span>'">`:'<span class="inventory-empty-photo">Sin foto</span>';
    return `<tr><td><div class="size-inventory-photo">${photo}</div></td><td><div class="size-inventory-product"><div><div class="size-inventory-name">${p.name||'Producto'}</div><div class="size-inventory-meta">${[p.brand,p.category,p.model].filter(Boolean).join(' · ')}</div></div></div></td><td><b>${r.talla}</b></td><td><span class="size-stock-number ${Number(r.stock)===0?'zero':''}">${Number(r.stock)||0}</span></td><td>${Number(r.vendidas)||0}</td><td><div class="size-inventory-actions"><button onclick="sizeStockAction(${r.id},'venta')" ${Number(r.stock)<=0?'disabled title="Sin existencias"':''}>Venta</button><button onclick="sizeStockAction(${r.id},'entrada')">+ Entrada</button><button onclick="sizeStockAction(${r.id},'ajuste')">Ajustar</button><button onclick="sizeStockAction(${r.id},'correccion')">Corregir ventas</button><button class="archive-size-btn" onclick="archiveProductSize(${r.id},${p.id})">Archivar talla</button></div></td></tr>`;
  }).join('')}</tbody></table>`;
 }catch(e){wrap.innerHTML=`<div class="empty" style="padding:20px">No se pudo cargar inventario por talla. Ejecuta inventario_tallas.sql en Supabase. ${e.message}</div>`;}
}
async function archiveProductSize(sizeRowId, productId){
  try{
    const {data:row,error:rowError}=await supabaseClient.from("inventario_tallas").select("id,producto_id,talla,stock,vendidas").eq("id",sizeRowId).single();
    if(rowError) throw rowError;
    const {data:product,error:productError}=await supabaseClient.from("productos").select("id,nombre,talla,stock").eq("id",productId).single();
    if(productError) throw productError;
    if(String(row.producto_id)!==String(product.id)) throw new Error("La talla seleccionada no corresponde a este producto.");
    const sizes=String(product.talla||"").split(/[,/|]+/).map(x=>x.trim()).filter(Boolean);
    const remaining=sizes.filter(size=>size.toLocaleLowerCase()!==String(row.talla||"").trim().toLocaleLowerCase());
    if(remaining.length===sizes.length) throw new Error("No se encontró esa talla en el producto. Actualiza el inventario y vuelve a intentarlo.");
    if(!confirm(`¿Archivar únicamente la talla ${row.talla} de “${product.nombre}”?\n\nEsta talla dejará de mostrarse en el catálogo. Las demás tallas y sus existencias no cambiarán.`)) return;
    // Guardar primero una copia recuperable de la talla antes de quitarla del catálogo.
    const {error:saveError}=await supabaseClient.from("tallas_archivadas").insert({producto_id:String(productId),producto_nombre:product.nombre||"Producto",talla:String(row.talla),stock:Number(row.stock)||0,vendidas:Number(row.vendidas)||0});
    if(saveError) throw new Error("No se pudo guardar la talla en Archivados. Ejecuta primero el SQL incluido. Detalle: "+saveError.message);
    const {error:updateError}=await supabaseClient.from("productos").update({talla:remaining.join(", ")}).eq("id",productId);
    if(updateError){
      await supabaseClient.from("tallas_archivadas").delete().eq("producto_id",String(productId)).eq("talla",String(row.talla));
      throw updateError;
    }
    const {error:logError}=await supabaseClient.from("inventario_movimientos").insert({producto_id:productId,producto_nombre:(product.nombre||"Producto")+" · talla "+row.talla,tipo:"archivo_talla",cantidad:0,stock_anterior:Number(row.stock)||0,stock_nuevo:Number(row.stock)||0,motivo:"Talla archivada individualmente desde inventario"});
    if(logError) console.warn("No se pudo registrar el archivo de talla:",logError.message);
    await renderSizeInventory(); await renderInventoryHistory(); await renderAdmin(); await renderArchived();
    alert(`Se archivó la talla ${row.talla}. Ya aparece en Productos archivados.`);
  }catch(error){console.error(error);alert("No se pudo archivar la talla: "+error.message);}
}

async function restoreArchivedSize(id){
  try{
    const {data:r,error}=await supabaseClient.from("tallas_archivadas").select("*").eq("id",id).single(); if(error)throw error;
    const {data:p,error:pe}=await supabaseClient.from("productos").select("id,nombre,talla").eq("id",r.producto_id).single(); if(pe)throw pe;
    if(!confirm(`¿Recuperar la talla ${r.talla} de “${p.nombre}”?`))return;
    const sizes=String(p.talla||"").split(/[,/|]+/).map(x=>x.trim()).filter(Boolean);
    if(!sizes.some(x=>x.toLowerCase()===String(r.talla).toLowerCase())) sizes.push(String(r.talla));
    const {error:up}=await supabaseClient.from("productos").update({talla:sizes.join(", ")}).eq("id",p.id); if(up)throw up;
    const {error:del}=await supabaseClient.from("tallas_archivadas").delete().eq("id",id); if(del)throw del;
    await renderArchived(); await renderAdmin(); await renderInventory();
    alert(`Talla ${r.talla} recuperada.`);
  }catch(e){console.error(e);alert("No se pudo recuperar la talla: "+e.message);}
}

async function permanentlyDeleteArchivedSize(id){
  try{
    const {data:r,error}=await supabaseClient.from("tallas_archivadas").select("id,producto_nombre,talla,stock,vendidas").eq("id",id).single(); if(error)throw error;
    if(!confirm(`¿Eliminar definitivamente la talla ${r.talla} de “${r.producto_nombre}”?\n\nSolo se eliminará esta talla archivada. Esta acción no se puede deshacer.`))return;
    const {error:del}=await supabaseClient.from("tallas_archivadas").delete().eq("id",id); if(del)throw del;
    await renderArchived();
    alert(`La talla ${r.talla} se eliminó de Archivados.`);
  }catch(e){console.error(e);alert("No se pudo eliminar la talla: "+e.message);}
}

async function sizeStockAction(id,action){
 try{
  const {data:r,error}=await supabaseClient.from('inventario_tallas').select('*,productos(nombre)').eq('id',id).single();if(error)throw error;
  let next,qty=0,nextSold=Number(r.vendidas)||0;
  if(action==='venta'){
   const raw=prompt(`¿Cuántas piezas de talla ${r.talla} se vendieron?\nExistencia: ${r.stock}`);if(raw===null)return;
   if(!/^\d+$/.test(raw.trim())||Number(raw)<1||Number(raw)>Number(r.stock))return alert('Cantidad no válida o mayor que la existencia.');
   qty=Number(raw);next=Number(r.stock)-qty;nextSold+=qty;
  }else if(action==='entrada'){
   const raw=prompt(`¿Cuántas piezas talla ${r.talla} entraron?`);if(raw===null)return;
   if(!/^\d+$/.test(raw.trim())||Number(raw)<1)return alert('Escribe una cantidad válida.');
   qty=Number(raw);next=Number(r.stock)+qty;
  }else if(action==='correccion'){
   if(!confirm(`Vas a corregir los datos de prueba de ${r.productos?.nombre||'este producto'} · talla ${r.talla}.\n\nStock actual: ${r.stock}\nVendidas actuales: ${r.vendidas}\n\nPodrás indicar los valores correctos. ¿Continuar?`))return;
   const rawStock=prompt(`Stock REAL para talla ${r.talla}:`,String(r.stock));if(rawStock===null)return;
   if(!/^\d+$/.test(rawStock.trim()))return alert('El stock debe ser un número entero igual o mayor que cero.');
   const rawSold=prompt(`Unidades vendidas REALES para talla ${r.talla}:`,String(r.vendidas||0));if(rawSold===null)return;
   if(!/^\d+$/.test(rawSold.trim()))return alert('Vendidas debe ser un número entero igual o mayor que cero.');
   next=Number(rawStock);nextSold=Number(rawSold);qty=next-Number(r.stock);
  }else{
   const raw=prompt(`Existencia final para talla ${r.talla}:`,String(r.stock));if(raw===null)return;
   if(!/^\d+$/.test(raw.trim()))return alert('Escribe una cantidad igual o mayor que cero.');
   next=Number(raw);qty=next-Number(r.stock);
  }
  const defaultReason=action==='venta'?'Venta de talla '+r.talla:action==='entrada'?'Reposición talla '+r.talla:action==='correccion'?'Corrección de venta de prueba · talla '+r.talla:'Ajuste de stock · talla '+r.talla;
  const motivo=prompt('Motivo (obligatorio):',defaultReason);if(motivo===null)return;if(!motivo.trim())return alert('El motivo es obligatorio.');
  const {error:up}=await supabaseClient.from('inventario_tallas').update({stock:next,vendidas:nextSold,updated_at:new Date().toISOString()}).eq('id',id);if(up)throw up;
  const movementType=action==='venta'?'venta':action==='entrada'?'entrada':action==='correccion'?'correccion':'ajuste';
  const {error:log}=await supabaseClient.from('inventario_movimientos').insert({producto_id:r.producto_id,producto_nombre:(r.productos?.nombre||'Producto')+' · talla '+r.talla,tipo:movementType,cantidad:action==='venta'?-qty:qty,stock_anterior:Number(r.stock),stock_nuevo:next,motivo:motivo.trim()});
  if(log)console.warn('Movimiento no guardado',log.message);
  await renderSizeInventory();await renderInventoryHistory();
  if(action==='correccion')alert('Corrección guardada. Se actualizaron stock y vendidas para esta talla; revisa los valores en inventario.');
 }catch(e){alert('No se pudo actualizar la talla: '+e.message);}
}

async function renderInventory(){
  await renderSizeInventory();
}

async function renderArchived(){
  const wrap=$("archivedProducts");
  if(!wrap) return;
  try{
    const query=String($("archivedSearch")?.value||"").trim().toLowerCase();
    const [{data:products,error:productError},{data:sizes,error:sizeError}]=await Promise.all([
      // Se consultan productos activos e inactivos para recuperar la foto y los datos
      // del modelo de una talla archivada; solo los productos inactivos se listan como producto completo.
      supabaseClient.from("productos").select("id,nombre,marca,categoria,modelo,talla,stock,activo,imagen").order("id",{ascending:false}),
      supabaseClient.from("tallas_archivadas").select("*").order("archivada_en",{ascending:false})
    ]);
    if(productError) throw productError;
    if(sizeError) throw new Error("No se pudieron consultar las tallas archivadas. Ejecuta el SQL incluido. "+sizeError.message);
    const allProducts=products||[];
    const productById=new Map(allProducts.map(p=>[String(p.id),p]));
    const archivedProducts=allProducts.filter(p=>p.activo===false).filter(p=>[p.nombre,p.marca,p.categoria,p.modelo,p.talla].join(" ").toLowerCase().includes(query)).map(p=>inventoryProductMarkup(p,true)).join("");
    const archivedSizes=(sizes||[]).filter(r=>{
      const p=productById.get(String(r.producto_id));
      return [r.producto_nombre,r.talla,p?.marca,p?.categoria,p?.modelo].join(" ").toLowerCase().includes(query);
    }).map(r=>{
      const p=productById.get(String(r.producto_id))||{};
      const name=r.producto_nombre||p.nombre||"Producto";
      const photo=p.imagen
        ? `<img src="${p.imagen}" alt="${name}" loading="lazy" style="width:52px;height:52px;object-fit:contain;background:#fff;border:1px solid #e5e5e5;border-radius:6px;flex:0 0 52px" onerror="this.style.display='none'">`
        : `<div style="width:52px;height:52px;flex:0 0 52px;border:1px solid #e5e5e5;border-radius:6px;display:grid;place-items:center;color:#888;font-size:10px;text-align:center">Sin foto</div>`;
      return `<div class="admin-item admin-product-card" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #ddd;border-radius:10px;margin:8px 0;flex-wrap:wrap">
        ${photo}
        <div class="grow" style="min-width:160px;flex:1"><b>${name}</b><br><small>${[p.marca,p.categoria,p.modelo].filter(Boolean).join(" · ")}</small><br><small>Talla: <b>${r.talla}</b> · Stock guardado: ${Number(r.stock)||0} · Vendidas: ${Number(r.vendidas)||0}</small><br><small>Archivado: ${r.archivada_en?new Date(r.archivada_en).toLocaleString("es-MX"):""}</small></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button onclick="restoreArchivedSize(${r.id})">Recuperar</button><button class="danger" onclick="permanentlyDeleteArchivedSize(${r.id})">Eliminar</button></div>
      </div>`;
    }).join("");
    wrap.innerHTML=(archivedSizes+archivedProducts)||'<div class="empty">No hay productos ni tallas archivados.</div>';
  }catch(error){ wrap.innerHTML=`<div class="empty">No se pudieron cargar los archivados: ${error.message}</div>`; }
}

async function logInventoryMovement({product,type,quantity,before,after,reason}){
  const {error}=await supabaseClient.from("inventario_movimientos").insert({
    producto_id:product.id,
    producto_nombre:product.name,
    tipo:type,
    cantidad:Number(quantity)||0,
    stock_anterior:Number(before)||0,
    stock_nuevo:Number(after)||0,
    motivo:String(reason||"").trim()
  });
  if(error) throw new Error("La existencia se actualizó, pero no se pudo guardar el historial. Ejecuta inventario.sql en Supabase. Detalle: "+error.message);
}

async function changeProductStock(id,type){
  try{
    const product=(await getProducts()).find(p=>String(p.id)===String(id));
    if(!product) throw new Error("No se encontró el producto.");
    const label=type==="entrada" ? "¿Cuántas unidades entraron?" : `¿Cuál será la existencia final de “${product.name}”?`;
    const raw=prompt(`${label}\nExistencia actual: ${product.stock}`);
    if(raw===null) return;
    if(raw.trim()==="" || !/^\d+$/.test(raw.trim())) return alert("Escribe una cantidad entera igual o mayor que cero.");
    const value=Number(raw);
    const next=type==="entrada" ? Number(product.stock)+value : value;
    if(!Number.isSafeInteger(next) || next<0) return alert("La cantidad no es válida.");
    if(type==="entrada" && value===0) return alert("La entrada debe ser mayor que cero.");
    const reason=prompt("Motivo del movimiento (obligatorio):",type==="entrada"?"Reposición de mercancía":"Ajuste de inventario");
    if(reason===null) return;
    if(!reason.trim()) return alert("Escribe el motivo para guardar el movimiento.");
    const {error}=await supabaseClient.from("productos").update({stock:next}).eq("id",id);
    if(error) throw error;
    try{
      await logInventoryMovement({product,type,quantity:type==="entrada"?value:next-Number(product.stock),before:product.stock,after:next,reason});
    }catch(logError){
      alert(logError.message);
    }
    await renderAdmin();
    await renderInventory();
    await renderArchived();
  }catch(error){ console.error(error); alert("No se pudo actualizar la existencia: "+error.message); }
}

async function permanentlyDeleteProduct(id){
  try{
    const product=(await getProducts()).find(p=>String(p.id)===String(id));
    if(!product) throw new Error("No se encontró el producto archivado.");
    const typedName=product.name||"este producto";
    if(!confirm(`¿Eliminar DEFINITIVAMENTE “${typedName}”?\n\nEsta acción no se puede deshacer. Se eliminará el producto archivado y sus registros de inventario por talla. El historial de movimientos se conservará.`)) return;
    // Elimina primero las filas de inventario por talla asociadas al producto.
    const {error:sizeError}=await supabaseClient.from("inventario_tallas").delete().eq("producto_id",id);
    if(sizeError) throw new Error("No se pudieron eliminar sus registros de tallas: "+sizeError.message);
    const {error:productError}=await supabaseClient.from("productos").delete().eq("id",id).eq("activo",false);
    if(productError) throw new Error("No se pudo eliminar el producto: "+productError.message);
    await renderAdmin();
    await renderInventory();
    await renderArchived();
    alert("Producto eliminado definitivamente. El historial de movimientos se conservó.");
  }catch(error){
    console.error(error);
    alert("No se pudo eliminar el producto: "+error.message);
  }
}

async function restoreProduct(id){
  try{
    const product=(await getProducts()).find(p=>String(p.id)===String(id));
    if(!product) throw new Error("No se encontró el producto.");
    if(!confirm(`¿Recuperar “${product.name}” y volver a activarlo en el catálogo?`)) return;
    const {error}=await supabaseClient.from("productos").update({activo:true}).eq("id",id);
    if(error) throw error;
    try{ await logInventoryMovement({product,type:"recuperacion",quantity:0,before:product.stock,after:product.stock,reason:"Producto recuperado del archivo"}); }
    catch(logError){ alert(logError.message); }
    await renderAdmin(); await renderInventory(); await renderArchived();
    alert("Producto recuperado. Si tiene existencia mayor que cero, volverá a aparecer en el catálogo.");
  }catch(error){ console.error(error); alert("No se pudo recuperar el producto: "+error.message); }
}

async function renderInventoryHistory(){
  const wrap=$("inventoryHistory");
  if(!wrap) return;
  try{
    const {data,error}=await supabaseClient.from("inventario_movimientos").select("id,producto_nombre,tipo,cantidad,stock_anterior,stock_nuevo,motivo,created_at").order("created_at",{ascending:false}).limit(100);
    if(error) throw error;
    wrap.innerHTML=(data||[]).map(m=>`<div class="admin-item" style="align-items:flex-start"><div class="grow"><b>${m.producto_nombre||"Producto"}</b><br><small>${new Date(m.created_at).toLocaleString("es-MX")} · ${m.tipo}</small><br><small>Existencia: ${m.stock_anterior} → ${m.stock_nuevo} · Cambio: ${m.cantidad>0?"+":""}${m.cantidad}</small><br><small>Motivo: ${m.motivo||"—"}</small></div></div>`).join("") || '<div class="empty">Todavía no hay movimientos registrados.</div>';
  }catch(error){ wrap.innerHTML=`<div class="empty">No se pudo cargar el historial. Comprueba que ejecutaste inventario.sql en Supabase. ${error.message}</div>`; }
}

$("saveWa").onclick = () => {
  const n = $("wa").value.replace(/\D/g, "");

  if(n.length < 10){
    return alert("Revisa el número.");
  }

  localStorage.setItem("jsWhatsApp", n);
  alert("WhatsApp guardado.");
};

function showCategoryPanel(name){
  const panels={
    list:"categoryListPanel",
    "add-category":"addCategoryPanel",
    "add-brand":"addBrandPanel"
  };
  Object.values(panels).forEach(id=>$(id)?.classList.add("hidden"));
  $(panels[name])?.classList.remove("hidden");

  if(name==="list"){
    renderCategoryBrands();
    renderVisualConfig();
  }else if(name==="add-category" || name==="add-brand"){
    renderVisualConfig();
  }
}

// Menú principal: Productos, Categorías, Agregar categoría, Agregar marca y Configuración
document.querySelectorAll(".admin-menu > button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".admin-menu > button")
      .forEach(x => x.classList.remove("active"));

    b.classList.add("active");

    ["products","categories","settings","inventory","archived"].forEach(v =>
      $(v + "View")?.classList.add("hidden")
    );

    const panel = b.dataset.categoryPanel;
    if(panel){
      $("categoriesView")?.classList.remove("hidden");
      showCategoryPanel(panel);
    }else{
      $(b.dataset.view + "View")?.classList.remove("hidden");
      if(b.dataset.view === "inventory") renderInventory();
      if(b.dataset.view === "archived") renderArchived();
    }
  };
});

// Búsquedas y actualización manual de inventario.
$("inventorySearch")?.addEventListener("input", renderInventory);
$("archivedSearch")?.addEventListener("input", renderArchived);
$("refreshInventoryHistory")?.addEventListener("click", renderInventoryHistory);

// Al cargar el administrador, solo Productos queda seleccionado.
$("categoriesView")?.classList.add("hidden");
$("inventoryView")?.classList.add("hidden");
$("archivedView")?.classList.add("hidden");

renderAdmin();
