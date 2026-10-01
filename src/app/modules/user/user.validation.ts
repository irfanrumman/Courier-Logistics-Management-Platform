import { z } from "zod";

export const updateUserStatusZodSchema = z.object({
	status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type IUpdateUserStatusPayload = z.infer<
	typeof updateUserStatusZodSchema
>;

export const userValidation = {
	updateUserStatusZodSchema,
};
