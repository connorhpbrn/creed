import { DocsCommand, InlineCode } from "./docs-code";
import type { DocsEntry } from "./docs-shell";
import type { ReactNode } from "react";

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="creed-list creed-list-bullet">{children}</ul>;
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="creed-list creed-list-ordered">{children}</ol>;
}

function Note({ children }: { children: ReactNode }) {
  return <blockquote className="creed-callout">{children}</blockquote>;
}

export const docsEntries: DocsEntry[] = [
  {
    id: "overview",
    label: "Overview",
    group: "Start here",
    title: "What Creed is",
    content: (
      <>
        <p>
          Your Creed holds the identity, goals, work, preferences, constraints, people, health, routines, and current context that should shape future replies. You own the file and decide what stays in it.
        </p>
        <p>
          Connected agents read it before meaningful work. When they learn something durable, they propose a focused change. You approve it, reject it, or allow trusted agents to edit selected sections directly.
        </p>
        <Note>
          <p>Creed is not a journal, chat history, or place to save everything. Keep only context that should change how an agent treats you.</p>
        </Note>
      </>
    ),
  },
  {
    id: "quickstart",
    label: "Quickstart",
    group: "Start here",
    title: "Run Creed Open",
    content: (
      <>
        <p>You need Node.js 22 or newer, npm 10 or newer, Git, and a Supabase project.</p>
        <DocsCommand>{`git clone https://github.com/hpbrn/creed.git
cd creed
npm install
npm run setup
npm run dev`}</DocsCommand>
        <Steps>
          <li><p>Open <InlineCode>http://localhost:3001</InlineCode>.</p></li>
          <li><p>Enter the owner secret created in <InlineCode>apps/open/.env.local</InlineCode>.</p></li>
          <li><p>Complete Personal onboarding and save your first Creed.</p></li>
          <li><p>Open Connections and connect one agent.</p></li>
        </Steps>
        <p>Run the read-only doctor whenever you want to check the installation:</p>
        <DocsCommand>npm run doctor</DocsCommand>
      </>
    ),
  },
  {
    id: "installation",
    label: "Installation",
    group: "Self-host Creed",
    title: "Install Creed",
    content: (
      <>
        <DocsCommand>npm run setup</DocsCommand>
        <p>
          Setup preserves unrelated environment values and asks before it changes the database. Secrets are written to <InlineCode>apps/open/.env.local</InlineCode> and are never printed after creation.
        </p>
        <h3>Manual setup</h3>
        <p>Use the manual path when the installer cannot run interactively.</p>
        <DocsCommand>{`cp apps/open/.env.example apps/open/.env.local
openssl rand -base64 48
openssl rand -base64 32
chmod 600 apps/open/.env.local`}</DocsCommand>
        <p>Then link Supabase, preview the migrations, apply them, and run the doctor.</p>
        <DocsCommand>{`cd apps/open
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
cd ../..
npm run doctor`}</DocsCommand>
      </>
    ),
  },
  {
    id: "deployment",
    label: "Deployment",
    group: "Self-host Creed",
    title: "Deploy Creed",
    content: (
      <>
        <h3>Vercel</h3>
        <Steps>
          <li><p>Fork the repository and import it into Vercel.</p></li>
          <li><p>Set the project root to <InlineCode>apps/open</InlineCode>.</p></li>
          <li><p>Add the production values from <InlineCode>apps/open/.env.example</InlineCode>.</p></li>
          <li><p>Set <InlineCode>NEXT_PUBLIC_SITE_URL</InlineCode> to the final HTTPS origin.</p></li>
          <li><p>Preview and apply Supabase migrations from a trusted local clone.</p></li>
          <li><p>Deploy, claim the installation, then verify a save and one agent connection.</p></li>
        </Steps>
        <h3>Other Node.js hosts</h3>
        <DocsCommand>{`npm install
npm run build --workspace creed-open
npm run start --workspace creed-open`}</DocsCommand>
        <p>The host must provide the required environment values and expose the configured site origin over HTTPS.</p>
      </>
    ),
  },
  {
    id: "configuration",
    label: "Configuration",
    group: "Self-host Creed",
    title: "Configure the installation",
    content: (
      <>
        <h3>Supabase</h3>
        <Bullets>
          <li><p><InlineCode>NEXT_PUBLIC_SUPABASE_URL</InlineCode> is the project URL.</p></li>
          <li><p><InlineCode>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</InlineCode> is safe for browser requests because Row Level Security protects the data.</p></li>
          <li><p><InlineCode>SUPABASE_SECRET_KEY</InlineCode> is server-only and must never use a <InlineCode>NEXT_PUBLIC_</InlineCode> prefix.</p></li>
        </Bullets>
        <h3>Owner access</h3>
        <p>The owner secret authorises a browser once. Rotating it invalidates existing owner cookies. Keep the owner and encryption secrets in a password manager.</p>
        <h3>Optional services</h3>
        <p>GitHub OAuth adds manual Markdown push and pull. OpenRouter enables analysis, Panel, Tab, and onboarding composition. The editor and agent connections work without either service.</p>
      </>
    ),
  },
  {
    id: "maintenance",
    label: "Updates and backups",
    group: "Self-host Creed",
    title: "Maintain the installation",
    content: (
      <>
        <p>Read the changelog, back up Supabase, preview migrations, and run the doctor before restarting.</p>
        <DocsCommand>{`git pull
npm install
cd apps/open
npx supabase db push --dry-run
npx supabase db push
cd ../..
npm run doctor`}</DocsCommand>
        <p>A Markdown export preserves the profile. A full recovery also needs revisions, proposals, settings, tokens, and avatars from Supabase.</p>
      </>
    ),
  },
  {
    id: "your-creed",
    label: "Your Creed",
    group: "Use Creed",
    title: "Write the context that matters",
    content: (
      <>
        <p>Every Personal Creed begins with five core sections: Identity, Goals, Work, Preferences, and Routines. Beliefs, Constraints, People, Health, and Context appear when you use them.</p>
        <Bullets>
          <li><p>Write facts that should affect future answers.</p></li>
          <li><p>Prefer concrete defaults, names, deadlines, and trade-offs.</p></li>
          <li><p>Remove stale details instead of preserving history.</p></li>
          <li><p>Create a custom section only when the context does not fit an existing one.</p></li>
        </Bullets>
        <Note><p>A short Creed that changes an answer is better than a complete biography that does not.</p></Note>
      </>
    ),
  },
  {
    id: "proposals",
    label: "Proposals and permissions",
    group: "Use Creed",
    title: "Control every change",
    content: (
      <>
        <p>Agents can read visible sections. Each section separately decides whether an agent may propose changes, edit directly, or only read.</p>
        <Bullets>
          <li><p><strong>Propose:</strong> the agent drafts a change for you to accept or reject.</p></li>
          <li><p><strong>Direct edit:</strong> a trusted agent applies the change immediately and records it in activity.</p></li>
          <li><p><strong>Read only:</strong> the agent can use the section but cannot change it.</p></li>
        </Bullets>
        <p>Use direct edit selectively. Identity, health, relationships, and strong constraints usually deserve review.</p>
      </>
    ),
  },
  {
    id: "quality",
    label: "Keep it useful",
    group: "Use Creed",
    title: "Keep the file sharp",
    content: (
      <>
        <p>Quality guidance looks for context that is specific, relevant, current, internally consistent, and complete enough to act on.</p>
        <Bullets>
          <li><p>Resolve contradictions before adding more detail.</p></li>
          <li><p>Turn vague preferences into observable defaults.</p></li>
          <li><p>Delete temporary states and completed goals.</p></li>
          <li><p>Review the weakest section first rather than rewriting the whole file.</p></li>
        </Bullets>
      </>
    ),
  },
  {
    id: "graph-tags",
    label: "Graph Tags and Nexus",
    group: "Use Creed",
    title: "Connect related sections",
    content: (
      <>
        <p>Type <InlineCode>#</InlineCode> in the editor and choose a visible section to create a Graph Tag. Two to four useful relationships per section is usually enough.</p>
        <p>Nexus shows those relationships as a read-only graph. It ignores plain hashtags that do not match a real section.</p>
        <Note><p>Use Graph Tags for section relationships, not for topics, brands, tools, or decorative labels.</p></Note>
      </>
    ),
  },
  {
    id: "connect-mcp",
    label: "Connect with MCP",
    group: "Connect agents",
    title: "Connect an agent with MCP",
    content: (
      <>
        <Steps>
          <li><p>Open Connections in your Creed installation.</p></li>
          <li><p>Choose the agent and use its generated command, configuration, or connector link.</p></li>
          <li><p>Complete authorisation in a browser that has owner access.</p></li>
          <li><p>Ask the agent to read Creed once and confirm access.</p></li>
        </Steps>
        <p>The MCP address is your installation origin followed by <InlineCode>/mcp</InlineCode>.</p>
        <DocsCommand>https://your-creed.example/mcp</DocsCommand>
      </>
    ),
  },
  {
    id: "agent-setup",
    label: "Agent setup",
    group: "Connect agents",
    title: "Common agent setup",
    content: (
      <>
        <h3>Claude Code</h3>
        <DocsCommand>claude mcp add --transport http creed https://your-creed.example/mcp --scope user</DocsCommand>
        <p>Run <InlineCode>/mcp</InlineCode> in Claude Code to authorise.</p>
        <h3>Codex</h3>
        <DocsCommand>codex mcp add creed --url https://your-creed.example/mcp</DocsCommand>
        <DocsCommand>codex mcp login creed</DocsCommand>
        <h3>OpenCode</h3>
        <DocsCommand>opencode mcp auth creed</DocsCommand>
        <p>Add Creed as a remote HTTP server in <InlineCode>opencode.json</InlineCode> before authorising.</p>
        <h3>Cursor</h3>
        <p>Use Add MCP on Connections, or add this to Cursor MCP settings. Authorise in the browser window Cursor opens.</p>
        <DocsCommand>{`{
  "mcpServers": {
    "creed": {
      "type": "http",
      "url": "https://your-creed.example/mcp"
    }
  }
}`}</DocsCommand>
        <h3>ChatGPT, Claude, and other clients</h3>
        <p>Add a custom remote MCP server using the URL shown on Connections. The application provides the exact connector action or configuration for supported clients.</p>
      </>
    ),
  },
  {
    id: "agent-behaviour",
    label: "How agents use Creed",
    group: "Connect agents",
    title: "How an agent should use Creed",
    content: (
      <>
        <Steps>
          <li><p>Read the visible Creed before meaningful work.</p></li>
          <li><p>Use it to shape tone, assumptions, priorities, and constraints.</p></li>
          <li><p>When something durable is learned, propose one narrow update to the right section.</p></li>
          <li><p>Do nothing when the information is temporary, uncertain, or already present.</p></li>
        </Steps>
        <h3>Good proposal</h3>
        <p>“Lead replies with the answer, then give supporting detail.”</p>
        <h3>Bad proposal</h3>
        <p>“The user is tired today and wants a short answer.”</p>
      </>
    ),
  },
  {
    id: "http-fallback",
    label: "HTTP fallback",
    group: "Connect agents",
    title: "Use the HTTP fallback",
    content: (
      <>
        <p>Create a connection in Creed, store its token privately, and send it in the Authorization header. Never put a token in a query string.</p>
        <DocsCommand>{`curl -fsS https://your-creed.example/api/creed \
  -H "Authorization: Bearer $CREED_TOKEN"`}</DocsCommand>
        <p>Read access uses <InlineCode>GET /api/creed</InlineCode>. Proposals use <InlineCode>POST /api/creed/proposals</InlineCode>. Direct edits use <InlineCode>POST /api/creed/write</InlineCode> only where the section permits them.</p>
      </>
    ),
  },
  {
    id: "mcp-reference",
    label: "MCP reference",
    group: "Reference and help",
    title: "MCP tools",
    content: (
      <>
        <h3>Read</h3>
        <p><InlineCode>read_creed</InlineCode>, <InlineCode>list_creeds</InlineCode>, <InlineCode>list_sections</InlineCode>, <InlineCode>get_write_policy</InlineCode>, <InlineCode>creed_get_section</InlineCode>, <InlineCode>creed_search</InlineCode>, <InlineCode>creed_get_recent_activity</InlineCode>, and <InlineCode>creed_get_quality_report</InlineCode>.</p>
        <h3>Change</h3>
        <p><InlineCode>creed_update_section</InlineCode>, <InlineCode>creed_append_to_section</InlineCode>, <InlineCode>creed_create_section</InlineCode>, <InlineCode>creed_delete_section</InlineCode>, <InlineCode>creed_rename_section</InlineCode>, <InlineCode>creed_recolor_section</InlineCode>, and <InlineCode>creed_reorder_section</InlineCode>.</p>
        <p>The focused change tools choose proposal or direct-edit mode from the live section policy. Agents should call <InlineCode>get_write_policy</InlineCode> instead of guessing.</p>
      </>
    ),
  },
  {
    id: "http-reference",
    label: "HTTP API",
    group: "Reference and help",
    title: "HTTP API",
    content: (
      <>
        <Bullets>
          <li><p><InlineCode>GET /api/creed</InlineCode> returns the visible profile and its operating contract.</p></li>
          <li><p><InlineCode>POST /api/creed/proposals</InlineCode> submits a structured proposal.</p></li>
          <li><p><InlineCode>POST /api/creed/write</InlineCode> applies an authorised direct edit.</p></li>
        </Bullets>
        <p>All endpoints require <InlineCode>Authorization: Bearer &lt;token&gt;</InlineCode>. Tokens are scoped to one connection and Creed. A missing or invalid token returns <InlineCode>401</InlineCode>; rate limits return <InlineCode>429</InlineCode>.</p>
      </>
    ),
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    group: "Reference and help",
    title: "Troubleshooting",
    content: (
      <>
        <h3>Database needs setup</h3>
        <p>Run setup again. It relinks Supabase, previews unapplied migrations, and asks before applying them.</p>
        <DocsCommand>npm run setup</DocsCommand>
        <h3>The doctor cannot verify Supabase</h3>
        <p>Confirm the project is active and that the project URL and server secret belong to the same project, then run <InlineCode>npm run doctor</InlineCode>.</p>
        <h3>No browser authorisation opens</h3>
        <p>Run the client’s login or MCP authorisation action again. Confirm the browser already has owner access to the Creed installation.</p>
        <h3>An old connection returns 401</h3>
        <p>Remove the connection, add it again using the current MCP URL, and complete OAuth once more.</p>
      </>
    ),
  },
  {
    id: "data-privacy",
    label: "Data and privacy",
    group: "Reference and help",
    title: "Your data and privacy",
    content: (
      <>
        <p>Creed Open stores profile content, revisions, proposals, settings, tokens, and uploaded assets in the Supabase project you configure.</p>
        <Bullets>
          <li><p>Connection tokens are hashed for lookup and encrypted when recoverable credentials must be stored.</p></li>
          <li><p>Connected agents receive only the Creed and permissions granted to their connection.</p></li>
          <li><p>Server secrets never belong in browser-exposed environment variables.</p></li>
          <li><p>Revoke a connection you no longer trust and rotate secrets when exposure is possible.</p></li>
        </Bullets>
        <p>You control where Creed runs and which agents can access it.</p>
      </>
    ),
  },
];
