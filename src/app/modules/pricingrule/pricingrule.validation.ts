import { z } from "zod";

export const createPricingRuleZodSchema = z
  .object({
    fromZoneId: z.string().uuid("Invalid from-zone ID"),
    toZoneId: z.string().uuid("Invalid to-zone ID"),
    weightMin: z.number().nonnegative("Minimum weight cannot be negative"),
    weightMax: z.number().positive("Maximum weight must be greater than 0"),
    basePrice: z.number().nonnegative("Base price cannot be negative"),
    perKgRate: z.number().nonnegative("Per-kg rate cannot be negative"),
  })
  // weightMax অবশ্যই weightMin এর চেয়ে বড় হতে হবে, নাহলে bracket-টাই অর্থহীন
  .refine((data) => data.weightMax > data.weightMin, {
    message: "weightMax must be greater than weightMin",
    path: ["weightMax"],
  });

export const updatePricingRuleZodSchema = z
  .object({
    weightMin: z.number().nonnegative().optional(),
    weightMax: z.number().positive().optional(),
    basePrice: z.number().nonnegative().optional(),
    perKgRate: z.number().nonnegative().optional(),
    // fromZoneId/toZoneId ইচ্ছাকৃতভাবে বাদ — zone বদলাতে চাইলে rule delete করে নতুন বানানোই safer,
    // কারণ zone বদলালে duplicate/overlap detection আবার নতুন করে করতে হয়
  })
  .refine(
    (data) =>
      !(data.weightMin !== undefined && data.weightMax !== undefined) ||
      data.weightMax! > data.weightMin!,
    { message: "weightMax must be greater than weightMin", path: ["weightMax"] },
  );

export type ICreatePricingRulePayload = z.infer<typeof createPricingRuleZodSchema>;
export type IUpdatePricingRulePayload = z.infer<typeof updatePricingRuleZodSchema>;

export const pricingRuleValidation = {
  createPricingRuleZodSchema,
  updatePricingRuleZodSchema,
};