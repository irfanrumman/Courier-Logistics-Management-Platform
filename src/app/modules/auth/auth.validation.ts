import z from "zod";
import { Gender } from "../../../generated/prisma/enums";


const customerRegistrationZodSchema = z.object({
	name: z
		.string("Not A String!")
		.min(3, "Name must atleast 3 characters long!!!")
		.max(10),
	email: z.email("Not email!!"),
	password: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
	gender: z.enum([Gender.MALE, Gender.FEMALE, Gender.OTHER]).optional(),
	phone: z.string().trim().optional(),
	defaultAddressLine: z.string().trim().optional(),
	defaultDistrict: z.string().trim().optional(),
	defaultThana: z.string().trim().optional(),
	defaultPostalCode: z.string().trim().optional(),
});
const customerEmailVerifyZodSchema = z.object({
	email: z.email("Not email!!"),
	otp: z.string().length(6),
});

const LoginZodSchema = z.object({
	email: z.email(),
	password: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
});

const ForgotPasswordZodSchema = z.object({
	email: z.email(),
});

const ResetPasswordZodSchema = z.object({
	email: z.email(),
	newPassword: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
	otp: z.string().length(6),
});

export const ChangePasswordZodSchema = z.object({
  oldPassword: z.string().min(1, "Old password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[a-z]/, "New password must contain at least 1 lowercase letter")
    .regex(/[A-Z]/, "New password must contain at least 1 uppercase letter")
    .regex(/[0-9]/, "New password must contain at least 1 number")
    .regex(/[^A-Za-z0-9]/, "New password must contain at least 1 special character"),
});

export type IChangePasswordPayload = z.infer<typeof ChangePasswordZodSchema>;

export const UserValidation = {
	customerRegistrationZodSchema,
	customerEmailVerifyZodSchema,
	LoginZodSchema,
	ForgotPasswordZodSchema,
	ResetPasswordZodSchema,
	ChangePasswordZodSchema
};
