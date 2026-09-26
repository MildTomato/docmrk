import FeedbackList from "./feedback";

export default function Organizations({
  params,
}: {
  params: { organizations: string };
}) {
  return (
    <div className="w-full flex flex-col items-center">
      <FeedbackList organizationId={params.organizations} />
    </div>
  );
}
