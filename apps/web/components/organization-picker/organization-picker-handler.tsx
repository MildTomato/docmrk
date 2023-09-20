import OrganizationsList from "./organizations-list";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "types";

export const dynamic = "force-dynamic";

export default async function OrganizationLoader() {
  // Create a Supabase client configured to use cookies
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: organizations } = await supabase.from("organizations").select();

  // This assumes you have a `todos` table in Supabase. Check out
  // the `Create Table and seed with data` section of the README 👇
  // https://github.com/vercel/next.js/blob/canary/examples/with-supabase/README.md
  // const { data: todos } = await supabase.from("organizations").select();

  console.log("render organization picker handler");

  return <OrganizationsList organizations={organizations} />;
}
