import type { Database } from "types/supabase"

export const CONTEXT_CHANGED_KEY = "docmrk-context-version"

export type ExtensionError = {
  code:
    | "AUTH_REQUIRED"
    | "ORGANIZATION_REQUIRED"
    | "FORBIDDEN"
    | "INVALID_REQUEST"
    | "NETWORK"
    | "UNKNOWN"
  message: string
}

export type Result<T> = { data: T | null; error: ExtensionError | null }
export type Feedback = Database["public"]["Tables"]["feedback"]["Row"]
export type Organization = { id: string; name: string }
export type AccountState = {
  user: { id: string; email?: string } | null
  organizations: Organization[]
  selectedOrganizationId: string | null
  confirmationRequired?: boolean
}

export type AccountRequest =
  | { action: "get" | "logout" | "oauth-github" }
  | { action: "login" | "signup"; email: string; password: string }
  | { action: "select-organization"; organizationId: string }

export type TweetRequest = {
  identifier_id: string
  metadata?: { tweetText?: string; url?: string; author?: string }
}
