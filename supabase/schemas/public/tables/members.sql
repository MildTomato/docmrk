CREATE TABLE "public"."members" (
  "team_id" bigint,
  "user_id" uuid,
  CONSTRAINT "members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT "members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

ALTER TABLE "public"."members"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can select their own row" ON "public"."members"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = (SELECT auth.uid())));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."members" TO "anon", "authenticated", "postgres", "service_role";
