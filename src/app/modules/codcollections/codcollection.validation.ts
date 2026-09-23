import { z } from "zod";

// Courier delivery সম্পন্ন করার সময় কত টাকা collect করলো সেটা রেকর্ড করবে
export const recordCollectionZodSchema = z.object({
  shipmentId: z.string().uuid("Invalid shipment ID"),
  amountCollected: z.number().positive("Collected amount must be greater than 0"),
});

// Admin/Hub Manager merchant/sender কে টাকা পাঠানোর পর mark করবে
export const markRemittedZodSchema = z.object({
  remittedAmount: z.number().positive("Remitted amount must be greater than 0"),
});

export type IRecordCollectionPayload = z.infer<typeof recordCollectionZodSchema>;
export type IMarkRemittedPayload = z.infer<typeof markRemittedZodSchema>;

export const codCollectionValidation = {
  recordCollectionZodSchema,
  markRemittedZodSchema,
};