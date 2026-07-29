
CREATE POLICY "menu_images_read" ON storage.objects FOR SELECT USING (bucket_id = 'menu-images');
CREATE POLICY "menu_images_staff_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menu-images' AND public.is_staff(auth.uid()));
CREATE POLICY "menu_images_staff_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'menu-images' AND public.is_staff(auth.uid()));
CREATE POLICY "menu_images_staff_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'menu-images' AND public.is_staff(auth.uid()));
