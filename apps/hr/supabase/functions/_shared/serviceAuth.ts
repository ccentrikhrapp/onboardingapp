// Service-to-service auth for cross-application integration calls. Neither
// app ever accepts a user JWT from the other on these endpoints — only this
// shared secret, set identically in both projects' function secrets
// (INTEGRATION_SHARED_SECRET). See docs/requirements/03-recruitment-hr-
// integration.md §8/§24.

export function verifyServiceRequest(req: Request): boolean {
  const expected = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!expected) return false; // never accept if the secret isn't configured
  const got = req.headers.get("X-Integration-Secret");
  return got === expected;
}
