import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "types";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/components/table";

export const dynamic = "force-dynamic";

export default async function FeedbackList() {
  // Create a Supabase client configured to use cookies
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: feedback } = await supabase.from("feedback").select();

  type Feedback = Database["public"]["Tables"]["feedback"]["Row"];

  return (
    <Table className="container">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">created_at</TableHead>
          <TableHead>status</TableHead>
          <TableHead>inserted_by</TableHead>
          <TableHead className="text-right">organization_id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {feedback.map((feedback: Feedback) => (
          <TableRow key={feedback.id}>
            <TableCell className="font-medium">
              {" "}
              {feedback.created_at}{" "}
            </TableCell>
            <TableCell>{feedback.status}</TableCell>
            <TableCell>{feedback.inserted_by}</TableCell>
            <TableCell className="text-right">
              {feedback.organization_id}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableCaption>A list of your recent invoices.</TableCaption>
    </Table>
  );
}
