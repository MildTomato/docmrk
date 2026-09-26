CREATE TABLE "public"."todos" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at"  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "title"       text,
  "is_complete" boolean                  DEFAULT false,
  CONSTRAINT "todos_pkey" PRIMARY KEY (id),
  "user_id"     uuid                     DEFAULT auth.uid(),
  CONSTRAINT "todos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

ALTER TABLE "public"."todos"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own todos" ON "public"."todos"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = (SELECT auth.uid())));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."todos" TO "anon", "authenticated", "postgres", "service_role";

CREATE POLICY "Authenticated users can insert their own todos" ON "public"."todos"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((SELECT auth.uid()) = user_id));
