import { describe, expect, it } from "vitest";
import { seal, unseal } from "../src/lib/secret-box";

const SECRET = "test-session-secret-at-least-32-characters";

describe("secret box", () => {
  it("round-trips and never stores the plain text", () => {
    const box = seal("sk-ant-example-key", SECRET);
    expect(box).not.toContain("sk-ant");
    expect(unseal(box, SECRET)).toBe("sk-ant-example-key");
  });
  it("gives a different box each time", () => {
    expect(seal("same", SECRET)).not.toBe(seal("same", SECRET));
  });
  it("returns null after the secret changes or the box is tampered with", () => {
    const box = seal("sk-ant-example-key", SECRET);
    expect(unseal(box, `${SECRET}-rotated`)).toBeNull();
    const parts = box.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1); // first ciphertext char: all 6 bits are data
    expect(unseal(parts.join("."), SECRET)).toBeNull();
    expect(unseal("garbage", SECRET)).toBeNull();
  });
});
