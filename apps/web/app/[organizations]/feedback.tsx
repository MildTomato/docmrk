import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "types";

export const dynamic = "force-dynamic";

export default async function FeedbackList() {
  // Create a Supabase client configured to use cookies
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: feedback } = await supabase.from("feedback").select();
  // .filter("organization_id", "eq", "1");

  // This assumes you have a `todos` table in Supabase. Check out
  // the `Create Table and seed with data` section of the README 👇
  // https://github.com/vercel/next.js/blob/canary/examples/with-supabase/README.md
  // const { data: todos } = await supabase.from("organizations").select();

  console.log("render organization picker handler");

  console.log("feedback", feedback);

  //   type Organization = Database["public"]["Tables"]["feedback"]["Row"];

  return (
    <ul>
      LIST
      {feedback.map((feedback) => (
        <li key={feedback.id}>{feedback.source}</li>
      ))}
    </ul>
  );
}
