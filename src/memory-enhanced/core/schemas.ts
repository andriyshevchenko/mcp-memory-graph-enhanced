import { z } from "zod";

// Zod schemas for enhanced entities and relations
export const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity"),
  agentThreadId: z.string().describe("The agent thread ID that created this entity"),
  timestamp: z.string().describe("ISO 8601 timestamp of when the entity was created"),
  confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});

export const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation"),
  agentThreadId: z.string().describe("The agent thread ID that created this relation"),
  timestamp: z.string().describe("ISO 8601 timestamp of when the relation was created"),
  confidence: z.number().min(0).max(1).describe("Confidence coefficient from 0 to 1"),
  importance: z.number().min(0).max(1).describe("Importance for memory integrity if lost: 0 (not important) to 1 (critical)")
});
