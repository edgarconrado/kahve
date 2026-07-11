-- Parche: las fotos de productos son función Pro (candado de servidor).
-- Correr una vez en el SQL Editor de Supabase (requiere patch_planes.sql previo).
drop policy if exists "product_images_insert" on storage.objects;
create policy "product_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and effective_plan() = 'pro');

drop policy if exists "product_images_update" on storage.objects;
create policy "product_images_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and effective_plan() = 'pro');
