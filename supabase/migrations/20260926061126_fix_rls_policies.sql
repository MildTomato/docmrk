DROP POLICY "ALLOW INSERT FOR ANYONE" ON "public"."feedback";

DROP POLICY "Anyone can select" ON "public"."feedback";

DROP POLICY "Owner can select" ON "public"."organizations";

DROP POLICY "select_organizations_policy" ON "public"."organizations";

DROP POLICY "view_organizations_policy" ON "public"."organizations";

DROP POLICY "Authenticated users can insert their own todos" ON "public"."todos";

DROP POLICY "Authenticated users can select todos" ON "public"."todos";

ALTER TABLE "public"."members"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners can insert feedback" ON "public"."feedback"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organizations o
  WHERE ((o.id = feedback.organization_id) AND (o.inserted_by = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Org owners can select feedback" ON "public"."feedback"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.organizations o
  WHERE ((o.id = feedback.organization_id) AND (o.inserted_by = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Org owners can update feedback" ON "public"."feedback"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.organizations o
  WHERE ((o.id = feedback.organization_id) AND (o.inserted_by = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Members can select their own row" ON "public"."members"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Owner can insert" ON "public"."organizations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((inserted_by = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Owner can select" ON "public"."organizations"
  FOR SELECT
  TO "authenticated"
  USING ((inserted_by = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Owner can update" ON "public"."organizations"
  FOR UPDATE
  TO "authenticated"
  USING ((inserted_by = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Authenticated users can select sources" ON "public"."sources"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Authenticated users can insert their own todos" ON "public"."todos"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can select their own todos" ON "public"."todos"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));
