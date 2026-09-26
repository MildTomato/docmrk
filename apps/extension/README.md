# Docmrk Chrome extension

Save X posts to a Docmrk organization. The extension shows whether a post is
saved, needs sign-in, or could not be saved.

## Run locally

Run these commands from the repository root:

```sh
npm install
npm run dev --workspace=extension
```

Set `PLASMO_PUBLIC_SUPABASE_URL` and `PLASMO_PUBLIC_SUPABASE_KEY` in
`apps/extension/.env`. Use a public Supabase key, never a service-role key.
Keep `CRX_KEY` stable if you need a consistent extension ID for GitHub sign-in.

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
and select `apps/extension/build/chrome-mv3-dev`. For a production build, run
`npm run build --workspace=extension` and load `build/chrome-mv3-prod` instead.
Reload the extension and any open X tabs after rebuilding.

## Sign in and save

Open the Docmrk toolbar popup, then **Open settings**. Sign in with your email
and password or GitHub. If you create an account that requires email
confirmation, confirm your email before signing in.

Choose the organization that will receive your posts. If your account has only
one organization, the extension selects it automatically. An account with no
organizations must create one in Docmrk before saving.

Open X and use **Save to Docmrk** on a post. A saved post cannot be submitted
again to the same organization. Switching organizations updates the post's
saved state. Quoted posts aren't given a second button inside the parent post;
open the quoted post to save it separately.

The popup and X controls update after sign-in, sign-out, and organization
changes. An expired session prompts you to sign in again. Connection and save
errors stay visible with a retry action.

## Configure GitHub sign-in

Enable GitHub in your Supabase project's authentication providers. In the
Supabase authentication URL configuration, add this exact redirect URL,
replacing `<extension-id>` with the ID shown in `chrome://extensions`:

```text
https://<extension-id>.chromiumapp.org/auth/callback
```

The extension uses PKCE and Chrome's
[identity authentication flow](https://developer.chrome.com/docs/extensions/reference/api/identity#method-launchWebAuthFlow).
Only the background worker handles authentication tokens. Add each development
or release extension ID that you use to the redirect allowlist.

## Database requirements

The extension uses the existing `organizations`, `sources`, and `feedback`
tables, including the `TWITTER` source key. The organization picker uses the
organizations visible to the signed-in user through row-level security.

Apply `supabase/migrations/20260926055505_extension_feedback_organization_scope.sql`
to the existing Docmrk schema before using organization-scoped captures. It
replaces global post uniqueness with `(organization_id, source, identifier_id)`
and restricts feedback reads and inserts to organization owners. It preserves
existing captures, including older rows without an `inserted_by` value.
It replaces feedback read and insert policies from either the original schema
or the organization-owner policy baseline. Existing update policies stay in place.
The repository's original migration contains only `todos`; it isn't a complete
bootstrap of the existing Docmrk database.

## Verify changes

Run the extension checks from the repository root:

```sh
npm run test --workspace=extension
npm run typecheck --workspace=extension
npm run build --workspace=extension
```

The tests cover post discovery, quoted posts, page navigation, recycled DOM
nodes, save states, session recovery, organization changes, and duplicate saves.
Run `supabase/tests/extension-feedback.sql` as the database owner after applying
the migration to a test database with the Docmrk schema. It verifies organization
isolation, capture authorship, and uniqueness. The test creates its own users,
source, and organizations, so it also runs on an empty schema. Its fixtures roll
back without advancing identity sequences.

In Chrome, verify the popup and settings, then open a post from the X timeline
without scrolling. Confirm that its save control appears. Sign in, save a post,
and reopen it to confirm the saved state. Sign out and verify that the same
controls offer sign-in instead of attempting an unauthenticated save.
