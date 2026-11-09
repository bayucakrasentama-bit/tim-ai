# BitBrowser MCP Integration — Design (Draft)

**Status:** Draft for owner approval. No BitBrowser token, app configuration, tunnel, profile, or production code has been changed.

## Intent

Make the existing BitBrowser installation usable from (1) local Hermes and (2) TIM-AI, both through TIM-AI's internal interface and its existing MCP endpoint. The YouTube tutorial's section from 07:43 is about BitBrowser Cloud Phone/Android profiles and opening apps; it does not explain AI integration. BitBrowser's official MCP setup is the appropriate connection mechanism.

## Confirmed facts

- The Mac has BitBrowser 7.2.0, which is newer than the official MCP minimum (7.1.5).
- The local MCP endpoint is `http://127.0.0.1:54345/mcp`; a no-key initialize probe returned HTTP 403 requesting `x-api-key`, confirming that Local API authentication is enforced.
- Hermes has HTTP MCP support and supports per-server `tools.include`/`tools.exclude`; no BitBrowser server is configured yet.
- TIM-AI already serves its own token-protected MCP endpoint in `src/connect.js` (`/api/mcp/:key`). It currently exposes TIM-AI reports only and has no BitBrowser client.
- Vercel cannot reach the Mac's loopback address. The existing ngrok tunnel maps to `localhost:8080`; it must not be repointed or interrupted.

## Proposed architecture

### 1) Local Hermes

Add BitBrowser as an HTTP MCP server at the local endpoint. Store the `x-api-key` only in local Hermes configuration with owner-only file permissions; never print it, place it in a repo, or send it through chat. After authenticated tool discovery, whitelist only verified read-only list/status tools with Hermes' per-server `tools.include` policy. Do not expose mutating tools in the initial version.

### 2) TIM-AI (internal UI and MCP)

Run a Mac-side bridge bound only to loopback. It must expose a hard-coded allowlist of verified read-only BitBrowser operations and enforce the same request/response schema regardless of caller; never provide a generic MCP proxy. The bridge retains the BitBrowser `x-api-key` locally. Publish only the bridge using a separate HTTPS tunnel; the Vercel backend authenticates to it with a newly generated, high-entropy bearer secret sent in an Authorization header. Store that secret only in Vercel server-side environment configuration and the Mac bridge's owner-only local secret store, support rotation/revocation, compare secrets in constant time, reject missing/invalid credentials, and never log credentials. Do not change the current port-8080 ngrok tunnel. If a distinct tunnel cannot be started without disruption, stop and ask before using another provider or changing the existing service.

Add a BitBrowser connection/status card in TIM-AI Integrations, with a manager-only, read-only connection test. Add the same allowlisted read-only operations to the TIM-AI internal AI/tool path and the existing `/api/mcp/:key` endpoint. As Bayu approved, access to BitBrowser tools on that MCP endpoint inherits the existing MCP-key authorization; any holder of a valid existing key can call the narrow read-only tools. Do not return the bridge secret or BitBrowser API token to the browser. Errors shown to users must not contain credentials or raw authorization headers.

## Initial access boundary

Default to read-only because no wider action scope was approved. Bayu approved returning only profile/device name, ID, group, and status—never proxy settings, fingerprint data, account/session content, or credentials. The first connection may discover the tool catalog but must query only verified profile/cloud-phone inventory or status methods. The bridge independently validates each operation and returned object, projects responses to those four allowed fields, limits each response to at most 100 records, and rejects unsupported methods/oversized requests rather than forwarding them. It must not create, edit, delete, open, close, restart, reset, or suspend profiles/devices; change proxies or fingerprints; perform account logins; or post content. A later request can widen this boundary explicitly.

## Success criteria

1. `hermes mcp test bitbrowser` authenticates successfully and Hermes registers only the verified allowlisted read-only tools.
2. TIM-AI's authenticated status/test reports connectivity without revealing either token; its internal tool path and public MCP URL expose only the same read-only allowlist.
3. An end-to-end read-only query succeeds through the dedicated bridge without opening or modifying any BitBrowser profile or Cloud Phone.
4. The existing `localhost:8080` tunnel remains unchanged and available.
5. Tests cover allowlisting, authentication failures, timeout/error masking, and that secrets never enter frontend responses or logs. Production deploy is verified separately.

## Constraints and remaining prerequisites

- The `x-api-key` must be retrieved from BitBrowser Settings → Browser Settings → Local API and entered directly via a local secret-entry method; do not paste it into Telegram or commit it.
- A dedicated authenticated HTTPS endpoint for the bridge is required for TIM-AI production. The current tunnel to port 8080 remains untouched; the separate tunnel must be verified before deployment.
- Bridge bearer secret must be generated locally, stored only in Vercel server-side configuration and the Mac bridge's owner-only secret store, and must never be exposed in the UI, MCP responses, or logs.
- Computer-use Accessibility and Screen Recording permissions were previously reported pending. If the token cannot be sourced through an approved local secret-entry method, Bayu must enable those macOS permissions or enter it locally; no privacy permission will be bypassed.

## Decisions made for this draft

- Local Hermes connects directly to BitBrowser; TIM-AI uses a separate authenticated Mac-side bridge.
- Initial access is read-only; returned fields are limited to profile/device name, ID, group, and status, with a 100-record response cap.
- The existing port-8080 tunnel is preserved; TIM-AI-to-bridge traffic uses a separate HTTPS tunnel and a dedicated bearer secret.
- The existing TIM-AI MCP key authorization is reused for the narrow read-only BitBrowser tools; any holder of a valid existing key can call them, as Bayu selected.
- The TIM-AI integration is surfaced in its Integrations UI, internal AI/tool path, and existing MCP endpoint, all sharing one server-side allowlist.
- Reviewer verdict: security boundaries have been clarified based on Bayu's choices. Owner approval is still required before implementation.
