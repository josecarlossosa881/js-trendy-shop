-- JS TRENDY SHOP — SQL DE PUBLICACIÓN + ORGANIZACIÓN AVANZADA
-- Ejecuta este archivo UNA SOLA VEZ en Supabase > SQL Editor.

-- 1) Lectura pública de productos activos
alter table public.productos enable row level security;

drop policy if exists "Public can read active products" on public.productos;

create policy "Public can read active products"
on public.productos
for select
to anon, authenticated
using (activo = true);

-- 2) Campos nuevos para organizar por marca, modelo y subcategoría
alter table public.productos add column if not exists marca text default '';
alter table public.productos add column if not exists modelo text default '';
alter table public.productos add column if not exists subcategoria text default '';

create index if not exists productos_marca_idx on public.productos (marca);
create index if not exists productos_categoria_idx on public.productos (categoria);


-- 3) Precio anterior para promociones
alter table public.productos add column if not exists precio_anterior numeric default 0;
