-- Public image bucket used by the frontoffice menu.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Complete the fictional catalogue with a dessert category.
INSERT INTO public.categories (name, slug, sort_order)
VALUES ('Sobremesas', 'sobremesas', 5)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

UPDATE public.menu_items SET
  name = 'SJA Clássico',
  description = 'Carne bovina 150 g, cheddar, alface, tomate, pickles e molho SJA.',
  price_cents = 450000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/classic-burger.jpg',
  sort_order = 1
WHERE name = 'Classic Burger';

UPDATE public.menu_items SET
  description = 'Dois hambúrgueres, cheddar duplo, bacon fumado, cebola caramelizada e molho barbecue.',
  price_cents = 600000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/bacon-cheese.jpg',
  sort_order = 2
WHERE name = 'Bacon Cheese';

UPDATE public.menu_items SET
  description = 'A assinatura da casa: carne, cheddar, ovo, bacon, batata palha e molho de pimenta suave.',
  price_cents = 700000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/sja-especial.jpg',
  sort_order = 3
WHERE name = 'SJA Especial';

UPDATE public.menu_items SET
  name = 'Sandes de Frango Grelhado',
  description = 'Frango marinado, alface, tomate e molho cremoso de ervas em pão artesanal.',
  price_cents = 380000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/sandes.jpg',
  sort_order = 1
WHERE name = 'Sandes de Frango';

UPDATE public.menu_items SET
  description = 'Fiambre e queijo derretido em pão tostado, simples e reconfortante.',
  price_cents = 280000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/sandes.jpg',
  sort_order = 2
WHERE name = 'Sandes Mista';

UPDATE public.menu_items SET
  name = 'Batata Crocante',
  description = 'Batatas rústicas douradas, temperadas com sal e ervas.',
  price_cents = 150000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/acompanhamentos.jpg',
  sort_order = 1
WHERE name = 'Batata Frita';

UPDATE public.menu_items SET
  name = 'Aros de Cebola',
  description = 'Aros de cebola crocantes com molho de alho assado.',
  price_cents = 180000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/acompanhamentos.jpg',
  sort_order = 2
WHERE name = 'Onion Rings';

UPDATE public.menu_items SET
  name = 'Cola SJA 33 cl',
  description = 'Refrigerante de cola servido bem fresco.',
  price_cents = 90000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/bebidas.jpg',
  sort_order = 1
WHERE name = 'Coca-Cola 33cl';

UPDATE public.menu_items SET
  name = 'Água Mineral 50 cl',
  description = 'Água mineral natural fresca.',
  price_cents = 60000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/bebidas.jpg',
  sort_order = 2
WHERE name = 'Água 50cl';

UPDATE public.menu_items SET
  name = 'Sumo de Maracujá 40 cl',
  description = 'Sumo tropical de maracujá preparado no dia.',
  price_cents = 120000,
  image_url = 'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/bebidas.jpg',
  sort_order = 3
WHERE name = 'Cerveja 33cl';

WITH category AS (SELECT id FROM public.categories WHERE slug = 'burgers')
INSERT INTO public.menu_items (category_id, name, description, price_cents, image_url, sort_order)
SELECT category.id, 'Burger Picante Luanda',
  'Carne 150 g, cheddar, jalapeño, cebola roxa e maionese picante.',
  550000,
  'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/classic-burger.jpg',
  4
FROM category
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name = 'Burger Picante Luanda');

WITH category AS (SELECT id FROM public.categories WHERE slug = 'sandes')
INSERT INTO public.menu_items (category_id, name, description, price_cents, image_url, sort_order)
SELECT category.id, 'Prego no Pão',
  'Bife tenro, cebola salteada, queijo e mostarda suave em pão tostado.',
  420000,
  'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/sandes.jpg',
  3
FROM category
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name = 'Prego no Pão');

WITH category AS (SELECT id FROM public.categories WHERE slug = 'sides')
INSERT INTO public.menu_items (category_id, name, description, price_cents, image_url, sort_order)
SELECT category.id, 'Asas Picantes',
  'Seis asas de frango glaceadas com molho agridoce picante.',
  350000,
  'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/acompanhamentos.jpg',
  3
FROM category
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name = 'Asas Picantes');

WITH category AS (SELECT id FROM public.categories WHERE slug = 'bebidas')
INSERT INTO public.menu_items (category_id, name, description, price_cents, image_url, sort_order)
SELECT category.id, 'Limonada com Hortelã 40 cl',
  'Limonada fresca com lima, hortelã e gelo.',
  100000,
  'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/bebidas.jpg',
  4
FROM category
WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE name = 'Limonada com Hortelã 40 cl');

WITH category AS (SELECT id FROM public.categories WHERE slug = 'sobremesas')
INSERT INTO public.menu_items (category_id, name, description, price_cents, image_url, sort_order)
SELECT category.id, dessert.name, dessert.description, dessert.price_cents,
  'https://bfnucgbjmvtrilfvznzi.supabase.co/storage/v1/object/public/menu-images/sobremesas.jpg',
  dessert.sort_order
FROM category
CROSS JOIN (
  VALUES
    ('Brownie de Chocolate', 'Brownie húmido de chocolate com calda quente.', 160000, 1),
    ('Gelado de Baunilha', 'Duas bolas de gelado cremoso de baunilha.', 140000, 2),
    ('Cheesecake de Maracujá', 'Cheesecake cremoso com cobertura tropical de maracujá.', 200000, 3)
) AS dessert(name, description, price_cents, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items WHERE menu_items.name = dessert.name
);
