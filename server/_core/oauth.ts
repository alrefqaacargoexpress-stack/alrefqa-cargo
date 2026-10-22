import type { Express } from "express";

/** Email/password is the only user login flow. Old provider callbacks cannot recreate sessions. */
export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", (_req, res) => {
    res.status(410).json({ error: "email_login_required", loginPath: "/auth" });
  });
}
