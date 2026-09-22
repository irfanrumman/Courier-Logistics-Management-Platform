import { z } from "zod";
import { Gender, UserStatus } from "../../../generated/prisma/enums";

const registerCustomerZodSchema = z.object({
  user: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters long"),

    email: z
      .email("Invalid email address")
      .trim()
      .toLowerCase(),

    phone: z
      .string()
      .trim()
      .optional(),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character",
      ),

    gender: z
      .enum(Gender)
      .optional(),
  }),

  customer: z.object({
    defaultAddressLine: z
      .string()
      .trim()
      .optional(),

    defaultDistrict: z
      .string()
      .trim()
      .optional(),

    defaultThana: z
      .string()
      .trim()
      .optional(),

    defaultPostalCode: z
      .string()
      .trim()
      .optional(),
  }),
});

const customerEmailVerifyZodSchema = z.object({
  email: z
    .email("Invalid email address")
    .trim()
    .toLowerCase(),

  otp: z
    .string()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d+$/, "OTP must contain only numbers"),
});

const updateCustomerProfileZodSchema = z.object({
  user: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters long")
        .optional(),

      phone: z
        .string()
        .trim()
        .optional(),

      gender: z
        .enum(Gender)
        .optional(),
    })
    .optional(),

  customer: z
    .object({
      defaultAddressLine: z
        .string()
        .trim()
        .optional(),

      defaultDistrict: z
        .string()
        .trim()
        .optional(),

      defaultThana: z
        .string()
        .trim()
        .optional(),

      defaultPostalCode: z
        .string()
        .trim()
        .optional(),
    })
    .optional(),
});

const adminUpdateCustomerZodSchema = z.object({
  status: z
    .enum(UserStatus)
    .optional(),
});

export type IRegisterCustomerPayload = z.infer<
  typeof registerCustomerZodSchema
>;

export type ICustomerEmailVerifyPayload = z.infer<
  typeof customerEmailVerifyZodSchema
>;

export type IUpdateCustomerProfilePayload = z.infer<
  typeof updateCustomerProfileZodSchema
>;

export type IAdminUpdateCustomerPayload = z.infer<
  typeof adminUpdateCustomerZodSchema
>;

export const customerValidation = {
  registerCustomerZodSchema,
  customerEmailVerifyZodSchema,
  updateCustomerProfileZodSchema,
  adminUpdateCustomerZodSchema,
};