"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database } from "types";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "ui";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export default function OrganizationsList({
  organizations = [],
}: {
  organizations: Organization[];
}) {
  // Create a Supabase client configured to use cookies

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const router = useRouter();

  // This assumes you have a `todos` table in Supabase. Check out
  // the `Create Table and seed with data` section of the README 👇
  // https://github.com/vercel/next.js/blob/canary/examples/with-supabase/README.md

  // return <pre>{JSON.stringify(todos, null, 2)}</pre>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {value
            ? organizations.find((organization) => organization.id === value)
                ?.name
            : "Select organization..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search framework..." />
          <CommandEmpty>No framework found.</CommandEmpty>
          <CommandGroup>
            {organizations.map((x) => {
              return (
                <CommandItem
                  key={x.id}
                  value={x.id}
                  onSelect={(currentValue) => {
                    setValue(currentValue);
                    setOpen(false);
                    router.push(currentValue);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      x.id === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {x.name}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
