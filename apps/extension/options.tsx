import { type FormEvent, useState } from "react"
import { Button } from "ui/components/button"
import { Input } from "ui/components/input"
import { Label } from "ui/components/label"

import {
  AccountNotice,
  Brand,
  OrganizationPicker
} from "~components/account-panel"
import { useAccount } from "~core/use-account"

import "./style.css"

function IndexOptions() {
  const { account, error, loading, pending, refresh, run } = useAccount()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmationEmail, setConfirmationEmail] = useState("")

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = await run({ action: mode, email: email.trim(), password })
    if (result && !result.error) {
      setPassword("")
      setConfirmationEmail(
        result.data?.confirmationRequired ? email.trim() : ""
      )
      if (result.data?.confirmationRequired) setMode("login")
    }
  }

  const handleGitHub = async () => {
    const result = await run({ action: "oauth-github" })
    if (result && !result.error) {
      setPassword("")
      setConfirmationEmail("")
    }
  }

  return (
    <main className="min-h-screen bg-background text-sm text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-6">
          <Brand />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            CHROME EXTENSION
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Save what matters.
          </h1>
          <p className="text-muted-foreground">
            Connect your account and save posts from X to your Docmrk
            organization.
          </p>
        </header>

        <section
          className="flex flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground"
          aria-busy={loading || !!pending}>
          {loading ? (
            <p className="text-muted-foreground" role="status">
              Checking your account…
            </p>
          ) : (
            <>
              <AccountNotice
                error={error}
                onRetry={refresh}
                disabled={!!pending}
              />
              {account?.user ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="text-base font-semibold">Your account</h2>
                      <p className="break-all text-muted-foreground">
                        {account.user.email || "Signed in to Docmrk"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={!!pending}
                      onClick={() => void run({ action: "logout" })}>
                      {pending === "logout" ? "Signing out…" : "Sign out"}
                    </Button>
                  </div>
                  <OrganizationPicker
                    account={account}
                    disabled={!!pending}
                    onChange={(organizationId) =>
                      void run({
                        action: "select-organization",
                        organizationId
                      })
                    }
                  />
                  {pending === "select-organization" ? (
                    <p className="text-muted-foreground" role="status">
                      Updating your organization…
                    </p>
                  ) : !error && account.selectedOrganizationId ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      You’re ready to save posts.
                    </p>
                  ) : null}
                  {account.organizations.length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!pending}
                      onClick={refresh}>
                      Refresh organizations
                    </Button>
                  ) : null}
                </>
              ) : account ? (
                <>
                  <h2 className="text-base font-semibold">
                    {mode === "login"
                      ? "Sign in to Docmrk"
                      : "Create your account"}
                  </h2>
                  {confirmationEmail ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Check your email at <strong>{confirmationEmail}</strong>{" "}
                      to confirm your account, then sign in here.
                    </p>
                  ) : null}
                  <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={!!pending}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        minLength={mode === "signup" ? 6 : undefined}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={!!pending}
                        aria-describedby={
                          mode === "signup" ? "password-hint" : undefined
                        }
                      />
                      {mode === "signup" ? (
                        <p
                          className="text-xs text-muted-foreground"
                          id="password-hint">
                          Use at least 6 characters.
                        </p>
                      ) : null}
                    </div>
                    <Button type="submit" disabled={!!pending}>
                      {pending === "login"
                        ? "Signing in…"
                        : pending === "signup"
                        ? "Creating account…"
                        : mode === "login"
                        ? "Sign in"
                        : "Create account"}
                    </Button>
                  </form>
                  <p className="text-center text-xs text-muted-foreground">
                    or
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!!pending}
                    onClick={() => void handleGitHub()}>
                    {pending === "oauth-github"
                      ? "Waiting for GitHub…"
                      : "Continue with GitHub"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {mode === "login"
                      ? "New to Docmrk? "
                      : "Already have an account? "}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 py-0"
                      disabled={!!pending}
                      onClick={() =>
                        setMode(mode === "login" ? "signup" : "login")
                      }>
                      {mode === "login" ? "Create an account" : "Sign in"}
                    </Button>
                  </p>
                </>
              ) : null}
            </>
          )}
        </section>

        <section className="flex flex-col items-start gap-3">
          <h2 className="font-medium">From your timeline to your team</h2>
          <p className="text-muted-foreground">
            Open X and choose <strong>Save to Docmrk</strong> on a post. Each
            save goes to the organization selected above.
          </p>
          <Button asChild variant="link" className="h-auto px-0 py-0">
            <a href="https://x.com/home" target="_blank" rel="noreferrer">
              Open X{" "}
              <span className="ml-2" aria-hidden="true">
                ↗
              </span>
            </a>
          </Button>
        </section>
      </div>
    </main>
  )
}

export default IndexOptions
