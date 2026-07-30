DROP POLICY IF EXISTS "delivery_zones_public_read_active"
ON public.delivery_zones;

CREATE POLICY "delivery_zones_public_read_active"
ON public.delivery_zones
FOR SELECT
TO anon, authenticated
USING (active);

CREATE POLICY "delivery_zones_admin_read_all"
ON public.delivery_zones
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
