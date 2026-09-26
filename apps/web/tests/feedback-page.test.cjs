const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const Module = require("node:module");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  createServerComponentClient,
} = require("@supabase/auth-helpers-nextjs");

const filename = path.resolve(__dirname, "../app/[organizations]/page.tsx");
const compiled = buildSync({
  entryPoints: [filename],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  jsx: "automatic",
  external: [
    "react",
    "react/jsx-runtime",
    "@supabase/auth-helpers-nextjs",
    "next/headers",
  ],
}).outputFiles[0].text;

const firstOrganization = "11111111-1111-4111-8111-111111111111";
const secondOrganization = "22222222-2222-4222-8222-222222222222";
const rows = [
  {
    id: "feedback-1",
    created_at: "2026-09-25",
    status: "untriaged",
    inserted_by: "first-author",
    organization_id: firstOrganization,
  },
  {
    id: "feedback-2",
    created_at: "2026-09-26",
    status: "reviewed",
    inserted_by: "second-author",
    organization_id: secondOrganization,
  },
];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function loadPage(fetch) {
  const source = new Module(filename, module);
  source.paths = Module._nodeModulePaths(path.dirname(filename));
  source.require = (name) => {
    if (name === "next/headers")
      return { cookies: () => ({ get: () => undefined }) };
    if (name === "@supabase/auth-helpers-nextjs")
      return {
        createServerComponentClient: (context) =>
          createServerComponentClient(context, {
            supabaseUrl: "https://docmrk-test.supabase.co",
            supabaseKey: "test-anon-key",
            options: { global: { fetch } },
          }),
      };
    return module.require(name);
  };
  source._compile(compiled, filename);
  return source.exports.default;
}

// Resolve async server components before passing the tree to React's sync renderer.
async function resolveServerComponents(element) {
  if (!React.isValidElement(element)) return element;
  if (typeof element.type === "function") {
    return resolveServerComponents(await element.type(element.props));
  }
  if (element.props.children === undefined) return element;
  const children = await Promise.all(
    React.Children.toArray(element.props.children).map(resolveServerComponents)
  );
  return React.cloneElement(element, undefined, ...children);
}

async function renderPage(Page, organizationId = firstOrganization) {
  return renderToStaticMarkup(
    await resolveServerComponents(
      React.createElement(Page, {
        params: { organizations: organizationId },
      })
    )
  );
}

test("database errors render a recoverable error instead of crashing or claiming no feedback", async () => {
  let failed = true;
  const requests = [];
  const Page = loadPage(async (input) => {
    requests.push(new URL(input));
    return failed
      ? json(
          { code: "42501", message: "permission denied for table feedback" },
          403
        )
      : json([rows[0]]);
  });
  const errorHtml = await renderPage(Page);
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, new RegExp(`href="/${firstOrganization}"`));
  assert.doesNotMatch(errorHtml, /<table|No feedback|permission denied/);

  failed = false;
  const recoveredHtml = await renderPage(Page);
  assert.match(recoveredHtml, /first-author/);
  assert.doesNotMatch(recoveredHtml, /role="alert"/);
  assert.equal(requests.length, 2);
});

test("an empty successful response has a distinct empty table state", async () => {
  const html = await renderPage(loadPage(async () => json([])));
  assert.match(html, /<table/);
  assert.match(html, /colSpan="4"/);
  assert.match(html, /No feedback/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("each organization route queries and renders only its own feedback", async () => {
  const requests = [];
  const Page = loadPage(async (input) => {
    const url = new URL(input);
    requests.push(url);
    const filter = url.searchParams.get("organization_id");
    // An unscoped query would return both organizations, as RLS may allow both.
    return json(
      filter
        ? rows.filter((row) => `eq.${row.organization_id}` === filter)
        : rows
    );
  });
  const firstHtml = await renderPage(Page, firstOrganization);
  const secondHtml = await renderPage(Page, secondOrganization);
  assert.deepEqual(
    requests.map((request) => request.pathname),
    ["/rest/v1/feedback", "/rest/v1/feedback"]
  );
  assert.deepEqual(
    requests.map((request) => request.searchParams.get("organization_id")),
    [`eq.${firstOrganization}`, `eq.${secondOrganization}`]
  );
  assert.match(firstHtml, /first-author/);
  assert.doesNotMatch(firstHtml, /second-author/);
  assert.match(secondHtml, /second-author/);
  assert.doesNotMatch(secondHtml, /first-author/);
  assert.match(firstHtml, /<caption[^>]*>Feedback/);
  assert.doesNotMatch(firstHtml, /invoices/i);
});

test("a response without a feedback payload is not mistaken for an empty organization", async () => {
  const html = await renderPage(
    loadPage(async () => new Response(null, { status: 204 }))
  );
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /No feedback|<table/);
});
