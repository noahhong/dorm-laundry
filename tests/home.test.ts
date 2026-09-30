import { describe, expect, it } from "vitest";
import { homeLinkLabel, resolveHome } from "../src/lib/home";

const hs = { slug: "hedrick-summit", name: "Hedrick Summit", rooms: [{ slug: "laundry", name: "Laundry room" }] };
const empty = { slug: "rieber", name: "Rieber", rooms: [] };
const two = { ...hs, rooms: [...hs.rooms, { slug: "north", name: "North laundry" }] };
const other = { slug: "sproul", name: "Sproul", rooms: [{ slug: "laundry", name: "Laundry room" }] };

describe("resolveHome", () => {
  it("is empty with no rooms anywhere", () => {
    expect(resolveHome([])).toEqual({ kind: "empty" });
    expect(resolveHome([empty])).toEqual({ kind: "empty" });
  });

  it("opens the only room, ignoring buildings without rooms", () => {
    const home = resolveHome([empty, hs]);
    expect(home).toMatchObject({ kind: "room", href: "/b/hedrick-summit/laundry" });
  });

  it("lists one building's rooms without a building picker", () => {
    expect(resolveHome([two, empty])).toMatchObject({ kind: "building", building: { slug: "hedrick-summit" } });
  });

  it("falls back to every building once a second one has rooms", () => {
    const home = resolveHome([hs, other]);
    expect(home.kind).toBe("all");
  });
});

describe("homeLinkLabel", () => {
  it("hides the link on the room that / opens", () => {
    expect(homeLinkLabel(resolveHome([hs]), { building: "hedrick-summit", room: "laundry" })).toBeNull();
  });

  it("names the destination otherwise", () => {
    expect(homeLinkLabel(resolveHome([hs]))).toBe("Laundry room");
    expect(homeLinkLabel(resolveHome([two]), { building: "hedrick-summit", room: "laundry" })).toBe("Hedrick Summit");
    expect(homeLinkLabel(resolveHome([hs, other]))).toBe("All rooms");
  });
});
