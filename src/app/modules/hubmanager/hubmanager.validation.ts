import { z } from "zod";

 const applyAsHubManagerZodSchema = z.object({
  user: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters long"),
    email: z.email("Invalid email address").trim().toLowerCase(),
    phone: z.string().trim().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
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
    password: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
});



export const UpdateHubManagerProfileValidationZodSchema = z.object({
	address: z
		.string()
		.trim()
		.min(5, "Address must be at least 5 characters long")
		.optional(),

	bio: z
		.string()
		.trim()
		.max(1000, "Bio cannot exceed 1000 characters")
		.optional(),

	consultationFee: z
		.number()
		.min(0, "Consultation fee cannot be negative")
		.optional(),

	contactNumber: z
		.string()
		.trim()
		.min(5, "Contact number is invalid")
		.optional(),
});

export type IApplyAsHubManagerPayload = z.infer<typeof applyAsHubManagerZodSchema>;
export type IHubManagerEmailVerifyPayload = z.infer<typeof hubManagerEmailVerifyZodSchema>;

export const hubManagerValidation = {
applyAsHubManagerZodSchema,
hubManagerEmailVerifyZodSchema,
}