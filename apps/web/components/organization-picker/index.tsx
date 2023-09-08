import OrganizationPickerHandler from "./organization-picker-handler";
import { Suspense } from "react";
import { Button } from "ui";

export default async function OrganizationPicker() {
  return (
    <Suspense fallback={<Loading />}>
      <OrganizationPickerHandler />
    </Suspense>
  );
}

async function Loading() {
  return (
    <Button
      disabled
      variant="outline"
      role="combobox"
      aria-expanded={false}
      className="w-[200px] justify-between"
    >
      Loading organizations...
    </Button>
  );
}
