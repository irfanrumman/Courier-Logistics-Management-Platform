import { z } from "zod";

export const createHubZodSchema = z.object({
  name: z.string().trim().min(2, "Hub name must be at least 2 characters long"),
  code: z
    .string()
    .trim()
    .min(2, "Hub code must be at least 2 characters long")
    .max(10, "Hub code cannot exceed 10 characters")
    .toUpperCase(),
  address: z.string().trim().min(5, "Address must be at least 5 characters long"),
  zoneId: z.string().uuid("Invalid zone ID"),
});

export const updateHubZodSchema = z.object({
  name: z.string().trim().min(2, "Hub name must be at least 2 characters long").optional(),
  code: z
    .string()
    .trim()
    .min(2, "Hub code must be at least 2 characters long")
    .max(10, "Hub code cannot exceed 10 characters")
    .toUpperCase()
    .optional(),
  address: z.string().trim().min(5, "Address must be at least 5 characters long").optional(),
  zoneId: z.string().uuid("Invalid zone ID").optional(),
});

export type ICreateHubPayload = z.infer<typeof createHubZodSchema>;
export type IUpdateHubPayload = z.infer<typeof updateHubZodSchema>;

export const hubValidation = {
  createHubZodSchema,
  updateHubZodSchema,
};