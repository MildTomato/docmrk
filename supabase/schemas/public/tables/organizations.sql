CREATE TABLE "public"."organizations" (
  "id"          uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "created_at"  timestamp with time zone    DEFAULT now(),
  "updated_at"  timestamp without time zone DEFAULT now(),
  "inserted_by" uuid                        NOT NULL,
  "name"        text                        NOT NULL,
  CONSTRAINT "organizations_inserted_by_fkey" FOREIGN KEY (inserted_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "organizations_name_key" UNIQUE (name),
  CONSTRAINT "organizations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."organizations"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select" ON "public"."organizations"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = inserted_by));

CREATE POLICY "select_organizations_policy" ON "public"."organizations"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id));

CREATE POLICY "view_organizations_policy" ON "public"."organizations"
  FOR SELECT
  TO "authenticated"
  USING ((inserted_by = auth.uid()));

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "anon", "authenticated", "postgres", "service_role";
