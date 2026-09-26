import { Button } from "ui/components/button"
import { Label } from "ui/components/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "ui/components/select"

import type { AccountState, ExtensionError } from "~core/contracts"

export function Brand() {
  return <div className="text-lg font-semibold tracking-tight">Docmrk</div>
}

export function AccountNotice({
  error,
  onRetry,
  disabled
}: {
  error: ExtensionError | null
  onRetry: () => void
  disabled: boolean
}) {
  if (!error) return null
  return (
    <div className="flex flex-col items-start gap-2" role="alert">
      <p className="text-sm text-destructive">{error.message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function OrganizationPicker({
  account,
  disabled,
  onChange
}: {
  account: AccountState
  disabled: boolean
  onChange: (id: string) => void
}) {
  if (account.organizations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No organizations are available for this account. Create or join an
        organization in Docmrk, then refresh.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="organization">Save posts to</Label>
      <Select
        name="organization"
        value={account.selectedOrganizationId || ""}
        disabled={disabled}
        onValueChange={onChange}>
        <SelectTrigger id="organization" aria-describedby="organization-hint">
          <SelectValue placeholder="Choose an organization" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {account.organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground" id="organization-hint">
        New saves go to this organization.
      </p>
    </div>
  )
}
