export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Every visible login action stays on the application's email/password page.
export const startLogin = () => {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/auth") window.location.assign("/auth");
};
