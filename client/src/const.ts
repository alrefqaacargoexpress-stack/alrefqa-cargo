import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// All visible login actions stay inside the application. Existing Manus OAuth
// sessions are still accepted by the server, but email users do not leave the
// site or see the Manus authorization page.
export const startLogin = () => {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/auth") window.location.assign("/auth");
};

// Kept only for backwards-compatible integrations that explicitly call the
// old provider flow; the application UI never uses it.
export const startManusLogin = () => {
  const oauthPortalUrl = window.__MANUS_CONFIG__?.oauthPortalUrl;
  const appId = window.__MANUS_CONFIG__?.projectId;
  if (!oauthPortalUrl || !appId) throw new Error("Manus login is not configured");
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });
  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  window.location.href = url.toString();
};
