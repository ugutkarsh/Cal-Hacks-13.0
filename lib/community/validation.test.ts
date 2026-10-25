import { describe, expect, it } from "vitest";
import {
  createInputToDbInsert,
  updateInputToDbPatch,
} from "@/lib/community/mappers";
import {
  clampPostListLimit,
  parsePostCreate,
  parsePostUpdate,
  POST_LIST_DEFAULT_LIMIT,
  POST_LIST_MAX_LIMIT,
  POST_MESSAGE_MAX,
} from "@/lib/community/validation";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("parsePostCreate", () => {
  it("requires a non-empty message and defaults structured fields", () => {
    const parsed = parsePostCreate({ message: "  Looking for a hike buddy  " });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.message).toBe("Looking for a hike buddy");
    expect(parsed.value.intent).toBe("find_teammates");
    expect(parsed.value.visibility).toBe("public");
    expect(parsed.value.status).toBe("open");
    expect(parsed.value.preferredDays).toEqual([]);
  });

  it("accepts optional structured fields", () => {
    const parsed = parsePostCreate({
      message: "Pickleball this weekend?",
      activity: "pickleball",
      category: "sports",
      city: "Berkeley",
      neighborhood: "Downtown",
      preferredDays: ["sat", "sun"],
      timeStartHour: 9,
      timeEndHour: 12,
      intent: "organize_meetup",
      skillLevel: "intermediate",
      budgetCents: 1500,
      radiusKm: 10,
      visibility: "author_discoverable",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.activity).toBe("pickleball");
    expect(parsed.value.city).toBe("Berkeley");
    expect(parsed.value.intent).toBe("organize_meetup");
    expect(parsed.value.budgetCents).toBe(1500);
    expect(parsed.value.radiusKm).toBe(10);
  });

  it("ignores forged ownerId / id on create", () => {
    const parsed = parsePostCreate({
      message: "Hello",
      ownerId: OTHER,
      id: OTHER,
      userId: OTHER,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      Object.prototype.hasOwnProperty.call(parsed.value, "ownerId"),
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed.value, "id")).toBe(
      false,
    );
    const insert = createInputToDbInsert(parsed.value, OWNER);
    expect(insert.owner_id).toBe(OWNER);
    expect(insert).not.toHaveProperty("id");
  });

  it("rejects oversized messages", () => {
    const parsed = parsePostCreate({
      message: "x".repeat(POST_MESSAGE_MAX + 1),
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects empty message", () => {
    expect(parsePostCreate({ message: "   " }).ok).toBe(false);
  });

  it("rejects invalid intent / radius / budget", () => {
    expect(
      parsePostCreate({ message: "Hi", intent: "spam" }).ok,
    ).toBe(false);
    expect(
      parsePostCreate({ message: "Hi", radiusKm: 999 }).ok,
    ).toBe(false);
    expect(
      parsePostCreate({ message: "Hi", budgetCents: -1 }).ok,
    ).toBe(false);
  });
});

describe("parsePostUpdate", () => {
  it("accepts partial patches and strips ownership fields from DB patch", () => {
    const parsed = parsePostUpdate({
      message: "Updated",
      city: "Oakland",
      ownerId: OTHER,
      id: OTHER,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const patch = updateInputToDbPatch(parsed.value);
    expect(patch.message).toBe("Updated");
    expect(patch.city).toBe("Oakland");
    expect(patch).not.toHaveProperty("owner_id");
    expect(patch).not.toHaveProperty("id");
  });

  it("rejects empty patch bodies", () => {
    expect(parsePostUpdate({}).ok).toBe(false);
  });
});

describe("clampPostListLimit", () => {
  it("defaults and clamps", () => {
    expect(clampPostListLimit(undefined)).toBe(POST_LIST_DEFAULT_LIMIT);
    expect(clampPostListLimit(3)).toBe(3);
    expect(clampPostListLimit(999)).toBe(POST_LIST_MAX_LIMIT);
    expect(clampPostListLimit("15")).toBe(15);
  });
});
