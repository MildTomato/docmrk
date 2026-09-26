CREATE TABLE "public"."teams" (
  "id"   integer NOT NULL DEFAULT nextval('public.teams_id_seq'::regclass),
  "name" text,
  CONSTRAINT "teams_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."teams"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."teams_id_seq" OWNED BY "public"."teams"."id";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."teams" TO "anon", "authenticated", "postgres", "service_role";
