import Link from "next/link";
import FeedbackList from "./feedback";

export default function Organizations() {
  // const supabase = createServerComponentClient({ cookies });

  // const { data: organizations } = useOrganizationsQuery();

  // const {
  //   data: { user },
  // } = await supabase.auth.getUser();

  return (
    <div className="w-full flex flex-col items-center">
      <Link href="/803c8ce2-2d8a-4221-a4f2-bea266f1c125">
        Go back to main org
      </Link>
      <FeedbackList />
    </div>
  );
}
