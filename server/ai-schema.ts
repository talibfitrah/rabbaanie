/**
 * AI Chat & Live Data Schema
 * 
 * Tables for:
 * - ai_conversations: Chat sessions between user and AI advisor
 * - ai_messages: Individual messages in a conversation
 * - live_data_entries: Real-time data input from users for personalized advice
 */

import { int, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";
import { users } from "../drizzle/schema";

/**
 * AI Conversations - Each conversation is a chat session
 */
export const aiConversations = mysqlTable("ai_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Child this conversation is about (optional - null for general family advice) */
  childId: varchar("childId", { length: 64 }),
  /** Conversation type: general, weekplan, treatment, freeform */
  type: varchar("type", { length: 32 }).notNull().default("freeform"),
  /** Title/summary of the conversation */
  title: varchar("title", { length: 255 }),
  /** Language: nl, ar, en */
  language: varchar("language", { length: 5 }).default("nl"),
  /** Whether conversation is active or archived */
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * AI Messages - Individual messages in a conversation
 */
export const aiMessages = mysqlTable("ai_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  /** Message role: user, assistant, system */
  role: varchar("role", { length: 16 }).notNull(),
  /** Message content */
  content: text("content").notNull(),
  /** AI provider used for this response */
  provider: varchar("provider", { length: 16 }),
  /** AI model used */
  model: varchar("model", { length: 64 }),
  /** Tokens used for this response */
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Live Data Entries - Real-time observations from parents
 * Used to provide contextual, timely advice
 */
export const liveDataEntries = mysqlTable("live_data_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Which child this observation is about */
  childId: varchar("childId", { length: 64 }),
  /** Category: behavior, mood, milestone, concern, prayer, achievement */
  category: varchar("category", { length: 32 }).notNull(),
  /** Short description/title */
  title: varchar("title", { length: 255 }).notNull(),
  /** Detailed description */
  description: text("description"),
  /** Severity/importance: low, medium, high */
  severity: varchar("severity", { length: 16 }).default("medium"),
  /** Mood/emotion at time of entry */
  mood: varchar("mood", { length: 32 }),
  /** Tags for categorization (JSON array) */
  tags: json("tags"),
  /** Whether this has been addressed by AI advice */
  addressed: boolean("addressed").default(false),
  /** Date of the observation (may differ from createdAt) */
  observedAt: timestamp("observedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Type exports
export type AIConversation = typeof aiConversations.$inferSelect;
export type InsertAIConversation = typeof aiConversations.$inferInsert;
export type AIMessage = typeof aiMessages.$inferSelect;
export type InsertAIMessage = typeof aiMessages.$inferInsert;
export type LiveDataEntry = typeof liveDataEntries.$inferSelect;
export type InsertLiveDataEntry = typeof liveDataEntries.$inferInsert;
