import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  collection: defineTable({
    teamId: v.string(),
    itemId: v.string(),
  }).index("by_team_item", ["teamId", "itemId"]),
});
