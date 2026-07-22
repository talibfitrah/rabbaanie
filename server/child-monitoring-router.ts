/**
 * Child Monitoring Router
 * Handles: custom tasks, family chat, daily summaries, child AI conversations,
 * app usage tracking, and parent AI consultations
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ============================================================
// CUSTOM TASKS ROUTER - Tasks assigned by parent to child
// ============================================================
export const customTasksRouter = router({
  /** Create a custom task for a child */
  create: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["prayer", "quran", "study", "chores", "sport", "other"]).default("other"),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      dueDate: z.string().optional(),
      recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createCustomTask({
        parentId: ctx.user.id,
        childAccountId: input.childAccountId,
        title: input.title,
        description: input.description || null,
        category: input.category,
        priority: input.priority,
        dueDate: input.dueDate || null,
        recurrence: input.recurrence,
      });
      return { id: result?.id, success: true };
    }),

  /** List tasks for a child */
  list: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return db.getCustomTasks(input.childAccountId, input.status);
    }),

  /** List all tasks created by parent */
  listByParent: protectedProcedure.query(async ({ ctx }) => {
    return db.getCustomTasksByParent(ctx.user.id);
  }),

  /** Update a task */
  update: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      priority: z.string().optional(),
      dueDate: z.string().optional(),
      status: z.string().optional(),
      parentFeedback: z.string().optional(),
      parentVerified: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { taskId, ...data } = input;
      await db.updateCustomTask(taskId, data as any);
      return { success: true };
    }),

  /** Delete a task */
  delete: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCustomTask(input.taskId);
      return { success: true };
    }),

  /** Child completes a task */
  complete: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      childNote: z.string().optional(),
      proofImageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.completeCustomTask(input.taskId, input.childNote, input.proofImageUrl);
      // Send notification to parent
      try {
        const tasks = await db.getCustomTasks(0); // We need the task to get parentId
        // Get task info directly from DB
        const database = await db.getDb();
        if (database) {
          const { customTasks: ct } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const [task] = await database.select().from(ct).where(eq(ct.id, input.taskId)).limit(1);
          if (task?.parentId) {
            await db.sendLocalizedPush(
              task.parentId,
              "Taak voltooid!", "Task completed!", "\u062a\u0645 \u0625\u0646\u062c\u0627\u0632 \u0627\u0644\u0645\u0647\u0645\u0629!",
              `Je kind heeft de taak "${task.title}" voltooid`,
              `Your child completed the task "${task.title}"`,
              `\u0623\u0643\u0645\u0644 \u0637\u0641\u0644\u0643 \u0627\u0644\u0645\u0647\u0645\u0629 "${task.title}"`,
              { type: "task_completed", taskId: input.taskId }
            );
          }
        }
      } catch (e) {
        console.warn("[Notify] Failed to notify parent of task completion:", e);
      }
      return { success: true };
    }),
});

// ============================================================
// FAMILY CHAT ROUTER - Direct messaging between parent and child
// ============================================================
export const familyChatRouter = router({
  /** Send a message */
  send: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      senderType: z.enum(["parent", "child"]),
      content: z.string().min(1),
      messageType: z.enum(["text", "image", "voice", "task_update"]).default("text"),
      attachmentUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.sendFamilyChatMessage({
        parentId: ctx.user.id,
        childAccountId: input.childAccountId,
        senderType: input.senderType,
        content: input.content,
        messageType: input.messageType,
        attachmentUrl: input.attachmentUrl || null,
      });
      // Send notification to parent when child sends a message
      if (input.senderType === "child") {
        try {
          await db.sendLocalizedPush(
            ctx.user.id,
            "Nieuw bericht van je kind", "New message from your child", "\u0631\u0633\u0627\u0644\u0629 \u062c\u062f\u064a\u062f\u0629 \u0645\u0646 \u0637\u0641\u0644\u0643",
            input.content.substring(0, 100),
            input.content.substring(0, 100),
            input.content.substring(0, 100),
            { type: "child_message", childAccountId: input.childAccountId }
          );
        } catch (e) {
          console.warn("[Notify] Failed to notify parent of child message:", e);
        }
      }
      return { id: result?.id, success: true };
    }),

  /** Get messages between parent and child */
  getMessages: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      limit: z.number().default(100),
    }))
    .query(async ({ ctx, input }) => {
      return db.getFamilyChatMessages(ctx.user.id, input.childAccountId, input.limit);
    }),

  /** Mark messages as read */
  markRead: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      readerType: z.enum(["parent", "child"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.markFamilyChatRead(ctx.user.id, input.childAccountId, input.readerType);
      return { success: true };
    }),

  /** Get unread count */
  unreadCount: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      readerType: z.enum(["parent", "child"]),
    }))
    .query(async ({ ctx, input }) => {
      return db.getUnreadChatCount(ctx.user.id, input.childAccountId, input.readerType);
    }),
});

// ============================================================
// CHILD DAILY SUMMARY ROUTER - Activity tracking & reports
// ============================================================
export const childSummaryRouter = router({
  /** Get daily summary for a child */
  getDaily: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      date: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getChildDailySummary(input.childAccountId, input.date);
    }),

  /** Get weekly summary for a child */
  getWeekly: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getChildWeeklySummary(input.childAccountId, input.startDate, input.endDate);
    }),

  /** Update/create daily summary (called by child's app) */
  upsert: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      date: z.string(),
      totalAppUsageSeconds: z.number().optional(),
      morningAdhkarDone: z.boolean().optional(),
      eveningAdhkarDone: z.boolean().optional(),
      sleepAdhkarDone: z.boolean().optional(),
      wakingAdhkarDone: z.boolean().optional(),
      customTasksCompleted: z.number().optional(),
      customTasksTotal: z.number().optional(),
      challengesCompleted: z.number().optional(),
      aiQuestionsAsked: z.number().optional(),
      screensVisited: z.any().optional(),
      firstOpenAt: z.string().optional(),
      lastCloseAt: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { childAccountId, date, ...data } = input;
      await db.upsertChildDailySummary(childAccountId, date, data as any);
      return { success: true };
    }),
});

// ============================================================
// CHILD AI CHAT ROUTER - Child asks AI questions
// ============================================================
export const childAiChatRouter = router({
  /** Create a new conversation */
  createConversation: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.createChildAiConversation({
        childAccountId: input.childAccountId,
        messages: [],
        messageCount: 0,
      });
      return { id: result?.id };
    }),

  /** List conversations for a child */
  listConversations: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      return db.getChildAiConversations(input.childAccountId, input.limit);
    }),

  /** Get a single conversation */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      return db.getChildAiConversation(input.conversationId);
    }),

  /** Send a message to AI and get response */
  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      childAccountId: z.number(),
      message: z.string().min(1),
      childAge: z.number().optional(),
      childGender: z.string().optional(),
      childName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Get existing conversation
      const conversation = await db.getChildAiConversation(input.conversationId);
      const existingMessages = (conversation?.messages as any[]) || [];

      // Build system prompt based on child's characteristics
      const ageDesc = input.childAge ? `${input.childAge} jaar oud` : "een kind";
      const genderDesc = input.childGender === "meisje" ? "een meisje" : "een jongen";
      const nameDesc = input.childName || "het kind";

      const systemPrompt = `Je bent een vriendelijke islamitische adviseur voor kinderen. Je praat met ${nameDesc}, ${genderDesc} van ${ageDesc}.

REGELS:
- Antwoord altijd op basis van de Qur'aan en Sunnah (met verwijzing naar de bron)
- Gebruik eenvoudige taal die past bij de leeftijd van het kind
- Wees bemoedigend en positief
- Als het kind iets vraagt dat niet gepast is, leg dan vriendelijk uit waarom en stuur het gesprek in een goede richting
- Gebruik Nederlandse taal tenzij het kind in een andere taal schrijft
- Houd antwoorden kort en begrijpelijk (max 3-4 zinnen voor jonge kinderen, langer voor tieners)
- Als je Arabische termen gebruikt, geef dan altijd de Nederlandse uitleg erbij
- Gebruik NOOIT westerse psychologische of filosofische termen. Gebruik alleen islamitische terminologie.
- Schrijf "Allaah" in plaats van "Allah" en "Salaah" in plaats van "Salah"`;

      // Build messages for LLM
      const llmMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...existingMessages.map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: input.message },
      ];

      // Call LLM
      let aiResponse = "";
      try {
        const res = await invokeLLM({
          
          messages: llmMessages,
        });
        const rawContent = res.choices[0]?.message?.content;
        aiResponse = (typeof rawContent === "string" ? rawContent : "") || "Sorry, ik kon geen antwoord genereren.";
      } catch (e) {
        aiResponse = "Er is een fout opgetreden. Probeer het later opnieuw.";
      }

      // Update conversation with new messages
      const updatedMessages = [
        ...existingMessages,
        { role: "user", content: input.message, timestamp: new Date().toISOString() },
        { role: "assistant", content: aiResponse, timestamp: new Date().toISOString() },
      ];

      const title = conversation?.title || input.message.substring(0, 50);

      await db.updateChildAiConversation(input.conversationId, {
        messages: updatedMessages,
        messageCount: updatedMessages.length,
        title,
      });

      return { response: aiResponse, messageCount: updatedMessages.length };
    }),

  /** Parent reviews a conversation (marks as reviewed) */
  markReviewed: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateChildAiConversation(input.conversationId, { parentReviewed: true });
      return { success: true };
    }),
});

// ============================================================
// CHILD APP USAGE ROUTER - Phone app usage tracking
// ============================================================
export const childAppUsageRouter = router({
  /** Log app usage from child's device */
  log: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      date: z.string(),
      packageName: z.string(),
      appName: z.string().optional(),
      usageSeconds: z.number(),
      category: z.string().optional(),
      openCount: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.logChildAppUsage({
        childAccountId: input.childAccountId,
        date: input.date,
        packageName: input.packageName,
        appName: input.appName || null,
        usageSeconds: input.usageSeconds,
        category: input.category || null,
        openCount: input.openCount || 0,
      });
      return { success: true };
    }),

  /** Bulk log app usage (sync all at once) */
  bulkLog: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      date: z.string(),
      apps: z.array(z.object({
        packageName: z.string(),
        appName: z.string().optional(),
        usageSeconds: z.number(),
        category: z.string().optional(),
        openCount: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      for (const app of input.apps) {
        await db.logChildAppUsage({
          childAccountId: input.childAccountId,
          date: input.date,
          packageName: app.packageName,
          appName: app.appName || null,
          usageSeconds: app.usageSeconds,
          category: app.category || null,
          openCount: app.openCount || 0,
        });
      }
      return { success: true, count: input.apps.length };
    }),

  /** Get app usage for a specific date */
  getDaily: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      date: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getChildAppUsage(input.childAccountId, input.date);
    }),

  /** Get app usage for a date range */
  getRange: protectedProcedure
    .input(z.object({
      childAccountId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      return db.getChildAppUsageRange(input.childAccountId, input.startDate, input.endDate);
    }),
});

// ============================================================
// PARENT AI CONSULTATION ROUTER - Parent consults AI about children/spouse
// ============================================================
export const parentAiConsultRouter = router({
  /** Create a new consultation */
  create: protectedProcedure
    .input(z.object({
      consultationType: z.enum(["child", "spouse"]),
      targetId: z.string().optional(),
      targetName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.createParentAiConsultation({
        parentId: ctx.user.id,
        consultationType: input.consultationType,
        targetId: input.targetId || null,
        targetName: input.targetName || null,
        messages: [],
        messageCount: 0,
      });
      return { id: result?.id };
    }),

  /** List consultations */
  list: protectedProcedure
    .input(z.object({
      consultationType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return db.getParentAiConsultations(ctx.user.id, input.consultationType);
    }),

  /** Get a single consultation */
  get: protectedProcedure
    .input(z.object({ consultationId: z.number() }))
    .query(async ({ input }) => {
      return db.getParentAiConsultation(input.consultationId);
    }),

  /** Send message and get AI response */
  sendMessage: protectedProcedure
    .input(z.object({
      consultationId: z.number(),
      message: z.string().min(1),
      consultationType: z.enum(["child", "spouse"]),
      targetName: z.string().optional(),
      targetAge: z.number().optional(),
      targetGender: z.string().optional(),
      parentGender: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const consultation = await db.getParentAiConsultation(input.consultationId);
      const existingMessages = (consultation?.messages as any[]) || [];

      let systemPrompt = "";

      if (input.consultationType === "child") {
        const childName = input.targetName || "het kind";
        const childAge = input.targetAge ? `${input.targetAge} jaar` : "onbekende leeftijd";
        const childGender = input.targetGender === "meisje" ? "dochter" : "zoon";

        systemPrompt = `Je bent een islamitische opvoedadviseur. De ouder vraagt advies over hun ${childGender} "${childName}" (${childAge}).

REGELS:
- Baseer al je adviezen op de Qur'aan en Sunnah (vermeld bronnen: soerah/ayah of hadith collectie)
- Geef praktische, uitvoerbare stappen
- Houd rekening met de leeftijd en het geslacht van het kind
- Gebruik de methodologie van de Salaf (vrome voorgangers)
- Wees bemoedigend naar de ouder
- Gebruik NOOIT westerse psychologische termen (geen "zelfbeeld", "grenzen stellen", "quality time" etc.)
- Gebruik islamitische terminologie: tarbiyah, adab, tawbah, sabr, shukr, tawakkul, etc.
- Schrijf "Allaah" in plaats van "Allah" en "Salaah" in plaats van "Salah"
- Antwoord in het Nederlands tenzij anders gevraagd`;
      } else {
        // Spouse consultation
        const spouseGender = input.targetGender === "vrouw" ? "echtgenote" : "echtgenoot";
        const parentRole = input.parentGender === "vrouw" ? "echtgenote" : "echtgenoot";

        systemPrompt = `Je bent een islamitische huwelijksadviseur. De ${parentRole} vraagt advies over de relatie met hun ${spouseGender}.

REGELS:
- Baseer al je adviezen op de Qur'aan en Sunnah (vermeld bronnen)
- Benadruk de rechten en plichten van beide echtgenoten in de Islam
- Geef praktische adviezen voor een harmonieus huwelijk
- Gebruik de methodologie van de Salaf
- Wees eerlijk maar respectvol - wijs op fouten van de vraagsteller als dat nodig is
- Gebruik NOOIT westerse relatietherapie-termen
- Gebruik islamitische terminologie: mawaddah, rahmah, qiwaamah, nushuz, mu'aasharah bil-ma'roef, etc.
- Schrijf "Allaah" in plaats van "Allah" en "Salaah" in plaats van "Salah"
- Antwoord in het Nederlands tenzij anders gevraagd`;
      }

      const llmMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...existingMessages.map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: input.message },
      ];

      let aiResponse = "";
      try {
        const res = await invokeLLM({
          
          messages: llmMessages,
        });
        const rawContent = res.choices[0]?.message?.content;
        aiResponse = (typeof rawContent === "string" ? rawContent : "") || "Sorry, ik kon geen antwoord genereren.";
      } catch (e) {
        aiResponse = "Er is een fout opgetreden. Probeer het later opnieuw.";
      }

      const updatedMessages = [
        ...existingMessages,
        { role: "user", content: input.message, timestamp: new Date().toISOString() },
        { role: "assistant", content: aiResponse, timestamp: new Date().toISOString() },
      ];

      await db.updateParentAiConsultation(input.consultationId, {
        messages: updatedMessages,
        messageCount: updatedMessages.length,
      });

      return { response: aiResponse, messageCount: updatedMessages.length };
    }),

  /** Delete a consultation */
  delete: protectedProcedure
    .input(z.object({ consultationId: z.number() }))
    .mutation(async ({ input }) => {
      // We don't actually delete, just clear messages
      await db.updateParentAiConsultation(input.consultationId, { messages: [], messageCount: 0 });
      return { success: true };
    }),
});
