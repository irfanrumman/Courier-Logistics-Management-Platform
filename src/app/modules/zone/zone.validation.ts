import { z } from "zod";

export const createZoneZodSchema = z.object({
  name: z.string().trim().min(2, "Zone name must be at least 2 characters long"),
  region: z.string().trim().optional(),
  adress: z.string().trim().optional(),
});

export const updateZoneZodSchema = z.object({
  name: z.string().trim().min(2, "Zone name must be at least 2 characters long").optional(),
  region: z.string().trim().optional(),
  adress: z.string().trim().optional(),
});

export type ICreateZonePayload = z.infer<typeof createZoneZodSchema>;
export type IUpdateZonePayload = z.infer<typeof updateZoneZodSchema>;

export const zoneValidation = {
  createZoneZodSchema,
  updateZoneZodSchema,
};