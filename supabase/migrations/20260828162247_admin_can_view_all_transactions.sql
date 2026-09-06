
CREATE POLICY "Admins can view all transactions" ON public.transactions
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can view all matches" ON public.matches
  FOR SELECT USING (public.is_admin());
