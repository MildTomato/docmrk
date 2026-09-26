CREATE TYPE "public"."source" AS ENUM (
  'internal',
  'twitter',
  'reddit',
  'email',
  'phone',
  'custom'
);

GRANT USAGE ON TYPE "public"."source" TO "postgres";
