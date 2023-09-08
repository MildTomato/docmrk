import { NavigationTop } from "@/components/NavigationTop";

export default function Organizations() {
  // const supabase = createServerComponentClient({ cookies });

  // const { data: organizations } = useOrganizationsQuery();

  // const {
  //   data: { user },
  // } = await supabase.auth.getUser();

  return (
    <div className="w-full flex flex-col items-center">
      <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
        <div className="w-full max-w-4xl flex justify-between items-center p-3 text-sm text-foreground">
          <NavigationTop />
        </div>
      </nav>
    </div>
  );
}
