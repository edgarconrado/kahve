-- Modificadores de prueba para el menú demo de Kahve
insert into modifiers (product_id, name, price_delta)
select p.id, m.name, m.price
from products p
cross join (values
  ('Tamaño grande', 10.00),
  ('Leche deslactosada', 0.00),
  ('Leche de avena', 8.00),
  ('Shot extra', 12.00)
) as m(name, price)
where p.name in ('Latte', 'Capuchino');
