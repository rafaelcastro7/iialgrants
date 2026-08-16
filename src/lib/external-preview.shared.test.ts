import { describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "@/lib/external-preview.shared";

describe("isSafeExternalUrl", () => {
  it("allows ordinary https URLs", () => {
    expect(isSafeExternalUrl("https://www.grants.gov/some/page")).toBe(true);
  });

  it("allows ordinary http URLs", () => {
    expect(isSafeExternalUrl("http://example.org")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeExternalUrl("not a url")).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("ftp://example.org/file")).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    expect(isSafeExternalUrl("http://localhost:5432")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1")).toBe(false);
    expect(isSafeExternalUrl("http://[::1]")).toBe(false);
  });

  it("rejects the cloud metadata endpoint", () => {
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    expect(isSafeExternalUrl("http://10.0.0.5")).toBe(false);
    expect(isSafeExternalUrl("http://192.168.1.1")).toBe(false);
    expect(isSafeExternalUrl("http://172.16.0.1")).toBe(false);
    expect(isSafeExternalUrl("http://172.31.255.255")).toBe(false);
  });

  it("allows a public IP that merely starts with a private-looking octet elsewhere", () => {
    // 172.32.x.x is outside the 172.16-31 private range and must not be blocked.
    expect(isSafeExternalUrl("http://172.32.0.1")).toBe(true);
  });

  it("rejects .local and .internal hostnames", () => {
    expect(isSafeExternalUrl("http://printer.local")).toBe(false);
    expect(isSafeExternalUrl("http://service.internal")).toBe(false);
  });
});
