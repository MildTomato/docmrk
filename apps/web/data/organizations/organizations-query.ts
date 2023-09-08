import { organizationKeys } from "./keys";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { PostgrestResponseSuccess } from "@supabase/postgrest-js";
import {
  QueryClient,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { Database } from "types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export type OrganizationsResponse = Organization[];

export async function getOrganizations(
  signal?: AbortSignal
): Promise<OrganizationsResponse> {
  const supabase = createClientComponentClient<Database>();
  const data = await supabase.from("organizations").select("*");

  if (data.error) throw data.error;

  const sorted = (data as PostgrestResponseSuccess<Organization[]>).data.sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  return sorted;
}

export type OrganizationsData = Awaited<ReturnType<typeof getOrganizations>>;
export type OrganizationsError = unknown;

export const useOrganizationsQuery = <TData = OrganizationsData>({
  enabled = true,
  ...options
}: UseQueryOptions<OrganizationsData, OrganizationsError, TData> = {}) =>
  useQuery<OrganizationsData, OrganizationsError, TData>(
    organizationKeys.list(),
    ({ signal }) => getOrganizations(signal),
    { enabled: enabled, ...options }
  );

export function prefetchOrganizations(client: QueryClient) {
  return client.prefetchQuery(organizationKeys.list(), ({ signal }) =>
    getOrganizations(signal)
  );
}

export const useOrganizationsPrefetch = () => {
  const client = useQueryClient();

  return useCallback(() => prefetchOrganizations(client), [client]);
};

export function invalidateOrganizationsQuery(client: QueryClient) {
  return client.invalidateQueries(organizationKeys.list());
}
