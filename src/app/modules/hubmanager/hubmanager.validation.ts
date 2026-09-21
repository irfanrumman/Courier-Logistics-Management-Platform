import { z } from "zod";
import { Gender, HubManagerStatus } from "../../../generated/prisma/enums";

 const applyAsHubManagerZodSchema = z.object({
  user: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters long"),
    email: z.email("Invalid email address").trim().toLowerCase(),
    phone: z.string().trim().optional(),
    gender: z.enum(Gender).optional(),
  }),
  hubManager: z.object({
    bio: z.string().trim().max(1000, "Bio cannot exceed 1000 characters").optional(),
    qualifications: z.string().trim().min(2, "Qualifications are required"),
    experienceYears: z
      .number()
      .int("Experience years must be an integer")
      .min(0, "Experience years cannot be negative"),
  }),
});

const hubManagerEmailVerifyZodSchema = z.object({
	email: z.email("Invalid email address").trim().toLowerCase(),
	otp: z.string().length(6),
    // password: z
	// 	.string()
	// 	.min(8, "Password Must Minimum 8 Characters Long.")
	// 	.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
	// 	.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

	// 	.regex(/[0-9]/, "Password must contain atleast 1 Number")
	// 	.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
});


const UpdateHubManagerProfileValidationZodSchema = z.object({
  user: z
    .object({
      name: z.string().trim().min(2, "Name must be at least 2 characters long").optional(),
      phone: z.string().trim().optional(),
      gender: z.enum(Gender).optional(),
    })
    .optional(),

  hubManager: z
    .object({
      bio: z.string().trim().max(1000, "Bio cannot exceed 1000 characters").optional(),
      qualifications: z
        .string()
        .trim()
        .min(2, "Qualifications must be at least 2 characters")
        .optional(),
      experienceYears: z
        .number()
        .int("Experience years must be an integer")
        .min(0, "Experience years cannot be negative")
        .optional(),
    })
    .optional(),
});

export const adminUpdateHubManagerZodSchema = z.object({
  hubId: z.string().uuid("Invalid hub ID").optional(),
  status: z.enum(HubManagerStatus).optional(),
});


export type IAdminUpdateHubManagerPayload = z.infer<typeof adminUpdateHubManagerZodSchema>;
export type IApplyAsHubManagerPayload = z.infer<typeof applyAsHubManagerZodSchema>;
export type IHubManagerEmailVerifyPayload = z.infer<typeof hubManagerEmailVerifyZodSchema>;

export const hubManagerValidation = {
applyAsHubManagerZodSchema,
hubManagerEmailVerifyZodSchema,
UpdateHubManagerProfileValidationZodSchema,
adminUpdateHubManagerZodSchema
}