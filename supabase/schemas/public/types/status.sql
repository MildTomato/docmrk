CREATE TYPE "public"."status" AS ENUM (
  'resolved',
  'review',
  'in_progress',
  'planned',
  'untriaged'
);

GRANT USAGE ON TYPE "public"."status" TO "postgres";
