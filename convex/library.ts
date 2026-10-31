import { queryGeneric, mutationGeneric } from "convex/server";
import type { DataModelFromSchemaDefinition, QueryBuilder, MutationBuilder } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import catalog from "../pz-tracker/catalog.json";

type DataModel = DataModelFromSchemaDefinition<typeof schema>;
const query: QueryBuilder<DataModel, "public"> = queryGeneric;
const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
const itemIds = new Set(catalog.items.map((item) => item.id));
const bookIds = new Set(catalog.items.filter((item) => item.category === "Books").map((item) => item.id));

function validateTeam(teamId: string) {
  if (!/^[a-f0-9]{48}$/.test(teamId)) throw new Error("Invalid team link.");
}

export const list = query({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    validateTeam(teamId);
    const rows = await ctx.db.query("collection")
      .withIndex("by_team_item", (q) => q.eq("teamId", teamId)).collect();
    return rows.map((row) => row.itemId);
  },
});

// One transaction adds all selected books without changing other collection entries.
export const importBooks = mutation({
  args: { teamId: v.string(), itemIds: v.array(v.string()) },
  handler: async (ctx, { teamId, itemIds }) => {
    validateTeam(teamId);
    if (itemIds.length > bookIds.size || itemIds.some((id) => !bookIds.has(id))) {
      throw new Error("Import must contain only known skill books.");
    }
    const rows = await ctx.db.query("collection")
      .withIndex("by_team_item", (q) => q.eq("teamId", teamId)).collect();
    const existing = new Set(rows.map((row) => row.itemId));
    const missing = [...new Set(itemIds)].filter((id) => !existing.has(id));
    for (const itemId of missing) await ctx.db.insert("collection", { teamId, itemId });
    return { added: missing.length };
  },
});

export const setCollected = mutation({
  args: { teamId: v.string(), itemId: v.string(), collected: v.boolean() },
  handler: async (ctx, { teamId, itemId, collected }) => {
    validateTeam(teamId);
    if (!itemIds.has(itemId)) throw new Error("Unknown catalog item.");
    const existing = await ctx.db.query("collection")
      .withIndex("by_team_item", (q) => q.eq("teamId", teamId).eq("itemId", itemId)).unique();
    if (collected && !existing) await ctx.db.insert("collection", { teamId, itemId });
    if (!collected && existing) await ctx.db.delete(existing._id);
  },
});
