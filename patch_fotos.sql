-- Parche: fotos de productos.
-- Correr una vez en el SQL Editor de Supabase.

alter table products add column if not exists image_url text;

-- Bucket público de lectura (las URLs de imagen funcionan sin firmar)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Subida y reemplazo solo para usuarios autenticados
create policy "product_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images');

create policy "product_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images');
