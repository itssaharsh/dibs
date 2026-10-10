import { describe, expect, it } from "vitest";
import { presenterOk } from "@/lib/admin";

const req = (key?: string) => new Request("http://x/api/admin/start", { method: "POST", headers: key ? { "x-presenter-key": key } : {} });

describe("admin-auth", () => {
  it("401s without the presenter key", () => {
    expect(presenterOk(req(), "s3cret")).toBe(false);
    expect(presenterOk(req("wrong!"), "s3cret")).toBe(false);
    expect(presenterOk(req("s3cret"), undefined)).toBe(false);
    expect(presenterOk(req("s3cret"), "s3cret")).toBe(true);
  });
});
