import {
  AccountNotice,
  Brand,
  OrganizationPicker
} from "~components/account-panel"
import { useAccount } from "~core/use-account"

import "./style.css"

import { Button } from "ui/components/button"

function IndexPopup() {
  const { account, error, loading, pending, refresh, run } = useAccount()
  const ready = !error && !!account?.user && !!account.selectedOrganizationId

  return (
    <main className="w-[360px] bg-background text-sm text-foreground">
      <header className="border-b px-5 py-4">
        <Brand />
      </header>
      <section
        className="flex min-h-[120px] flex-col gap-4 px-5 py-5"
        aria-busy={loading || !!pending}>
        {loading ? (
          <p className="text-muted-foreground" role="status">
            Checking your account…
          </p>
        ) : (
          <>
            <div className="font-medium" role="status">
              {error
                ? "Account needs attention"
                : ready
                ? "Ready to save"
                : account?.user
                ? "Choose where to save"
                : "Sign in to get started"}
            </div>
            <AccountNotice
              error={error}
              onRetry={refresh}
              disabled={!!pending}
            />
            {account?.user ? (
              <>
                <p className="break-all text-muted-foreground">
                  {account.user.email || "Signed in to Docmrk"}
                </p>
                <OrganizationPicker
                  account={account}
                  disabled={!!pending}
                  onChange={(organizationId) =>
                    void run({ action: "select-organization", organizationId })
                  }
                />
                {pending === "select-organization" ? (
                  <p className="text-muted-foreground" role="status">
                    Updating your organization…
                  </p>
                ) : null}
              </>
            ) : !error ? (
              <p className="text-muted-foreground">
                Sign in and choose an organization in settings to save posts
                from X.
              </p>
            ) : null}
          </>
        )}
      </section>
      <div className="flex gap-2 px-5">
        <Button
          type="button"
          className="flex-1"
          onClick={() => void chrome.runtime.openOptionsPage()}>
          Open settings
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <a href="https://x.com/home" target="_blank" rel="noreferrer">
            Open X{" "}
            <span className="ml-2" aria-hidden="true">
              ↗
            </span>
          </a>
        </Button>
      </div>
      <p className="px-5 py-4 text-center text-xs text-muted-foreground">
        Use Save to Docmrk on a post on X.
      </p>
    </main>
  )
}

export default IndexPopup
