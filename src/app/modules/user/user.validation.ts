import { z } from "zod";

// Admin শুধু ACTIVE <-> SUSPENDED এর মধ্যেই টগল করবে (ban/unban) —
// DELETED status এখানে দেওয়া যাবে না, সেটা আলাদা delete flow-এর কাজ (পরের ধাপে ঠিক করবো)
export const updateUserStatusZodSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type IUpdateUserStatusPayload = z.infer<typeof updateUserStatusZodSchema>;

export const userValidation = {
  updateUserStatusZodSchema,
};