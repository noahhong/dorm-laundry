// Where "/" sends residents. The pilot runs one building, so the resident UI hides building navigation
// whenever only one building has rooms; the data model stays multi-building for later.

type RoomRef = { slug: string; name: string };
type BuildingRef = { slug: string; name: string; rooms: readonly RoomRef[] };

export type Home<B extends BuildingRef = BuildingRef> =
  | { kind: "empty" }
  | { kind: "room"; href: string; building: B; room: B["rooms"][number] }
  | { kind: "building"; building: B }
  | { kind: "all"; buildings: B[] };

export function roomHref(building: { slug: string }, room: { slug: string }) {
  return `/b/${building.slug}/${room.slug}`;
}

/** Buildings with no rooms (e.g. a half-set-up one in /admin) don't count, so they can't bring the picker back. */
export function resolveHome<B extends BuildingRef>(buildings: readonly B[]): Home<B> {
  const withRooms = buildings.filter((b) => b.rooms.length > 0);
  if (withRooms.length === 0) return { kind: "empty" };
  if (withRooms.length > 1) return { kind: "all", buildings: withRooms };
  const building = withRooms[0];
  if (building.rooms.length === 1) {
    const room = building.rooms[0];
    return { kind: "room", href: roomHref(building, room), building, room };
  }
  return { kind: "building", building };
}

/** Label for a link back to "/", or null when "/" would just redirect to this same room. */
export function homeLinkLabel(home: Home, here?: { building: string; room: string }): string | null {
  switch (home.kind) {
    case "room":
      return here && home.building.slug === here.building && home.room.slug === here.room ? null : home.room.name;
    case "building":
      return home.building.name;
    default:
      return "All rooms";
  }
}
