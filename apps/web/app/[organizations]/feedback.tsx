import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "types";
import { Button } from "ui/components/button";
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
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: feedback, error } = await supabase.from("feedback").select();

  if (error || !feedback) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-destructive">
          Could not load feedback for this organization. Please try again.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href="">Try again</a>
        </Button>
      </div>
    );
  }

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
        {feedback.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={4}
              className="text-center text-muted-foreground"
            >
              No feedback has been saved to this organization yet.
            </TableCell>
          </TableRow>
        ) : (
          feedback.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.created_at}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell>{item.inserted_by}</TableCell>
              <TableCell className="text-right">
                {item.organization_id}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
      <TableCaption>A list of your recent invoices.</TableCaption>
    </Table>
  );
}
