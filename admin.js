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
  saveCats(["Todos", ...active.map(c=>c.nombre)]);
  return cats;
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
  const cats=getCats().filter(c=>c!=="Todos");
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
    const ps = await getProducts();

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
        <button onclick="deleteProduct(${p.id})">Eliminar</button>
      </div>
    `).join("") || '<div class="empty">Todavía no tienes productos.</div>';

    await renderCategoryBrands();
  }catch(error){
    console.error(error);
    $("adminProducts").innerHTML =
      `<div class="empty">No se pudieron cargar los productos: ${error.message}</div>`;
  }
}

function fillCats(selected = ""){
  const cs = getCats().filter(c => c !== "Todos");

  $("pCat").innerHTML = cs.map(c =>
    `<option value="${c.replaceAll('"','&quot;')}" ${c === selected ? "selected" : ""}>${c}</option>`
  ).join("");

  if(!cs.length){
    $("pCat").innerHTML = `<option value="">Sin categoría</option>`;
  }
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

  fillCats(p?.category || getCats()[1] || "");

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
  if(!confirm("¿Eliminar este producto?")) return;

  try{
    const { data, error: readError } = await supabaseClient
      .from("productos")
      .select("imagen")
      .eq("id", id)
      .single();

    if(readError) throw readError;

    const { error } = await supabaseClient
      .from("productos")
      .delete()
      .eq("id", id);

    if(error) throw error;

    if(data?.imagen){
      await deleteStorageImage(data.imagen);
    }

    await renderAdmin();
  }catch(error){
    console.error(error);
    alert("No se pudo eliminar el producto: " + error.message);
  }
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

    ["products","categories","settings"].forEach(v =>
      $(v + "View")?.classList.add("hidden")
    );

    const panel = b.dataset.categoryPanel;
    if(panel){
      $("categoriesView")?.classList.remove("hidden");
      showCategoryPanel(panel);
    }else{
      $(b.dataset.view + "View")?.classList.remove("hidden");
    }
  };
});

// Al cargar el administrador, solo Productos queda seleccionado.
$("categoriesView")?.classList.add("hidden");

renderAdmin();
