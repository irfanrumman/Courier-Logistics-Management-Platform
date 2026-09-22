import { z } from "zod";
import { Gender, MerchantStatus, MerchantVerificationStatus } from "../../../generated/prisma/enums";


 const registerMerchantZodSchema = z.object({
  user: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters long"),
    email: z.email("Invalid email address").trim().toLowerCase(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[a-z]/, "Password must contain at least 1 lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
      .regex(/[0-9]/, "Password must contain at least 1 number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 special character"),
    phone: z.string().trim().optional(),
    gender: z.enum(Gender).optional(),
  }),
  merchantProfile: z.object({
    businessName: z.string().trim().min(2, "Business name is required"),
    ownerName: z.string().trim().min(2, "Owner name is required"),
    pickupAddressLine: z.string().trim().optional(),
    pickupDistrict: z.string().trim().optional(),
    pickupThana: z.string().trim().optional(),
    pickupPostalCode: z.string().trim().optional(),
    tradeLicenseNumber: z.string().trim().min(1, "Trade license number is required"),
    nidNumber: z.string().trim().min(1, "NID number is required"),
    tinNumber: z.string().trim().min(1, "TIN number is required"),
  }),
});

const merchantEmailVerifyZodSchema = z.object({
  email: z.email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits"),
});


const updateMerchantProfileZodSchema = z.object({
  user: z
    .object({
      name: z.string().trim().min(2).optional(),
      phone: z.string().trim().optional(),
      gender: z.enum(Gender).optional(),
    })
    .optional(),
  merchantProfile: z
    .object({
      businessName: z.string().trim().min(2).optional(),
      ownerName: z.string().trim().min(2).optional(),
      PickupAddressLine: z.string().trim().optional(),
      PickupDistrict: z.string().trim().optional(),
      PickupThana: z.string().trim().optional(),
      PickupPostalCode: z.string().trim().optional(),
    })
    .optional(),
});

const verifyMerchantZodSchema = z.object({
  merchantId: z.string().uuid("Invalid merchant ID"),
  verificationStatus: z.enum(MerchantVerificationStatus),
  rejectionReason: z.string().trim().optional(),
  codLimit: z.number().positive().optional(),
}).refine(
  (data) => data.verificationStatus !== "REJECTED" || !!data.rejectionReason,
  { message: "Rejection reason is required when rejecting", path: ["rejectionReason"] },
);

const adminUpdateMerchantStatusZodSchema = z.object({
  status: z.enum(MerchantStatus),
});

export type IRegisterMerchantPayload = z.infer<typeof registerMerchantZodSchema>;
export type IMerchantEmailVerifyPayload = z.infer<typeof merchantEmailVerifyZodSchema>;
export type IUpdateMerchantProfilePayload = z.infer<typeof updateMerchantProfileZodSchema>;
export type IVerifyMerchantPayload = z.infer<typeof verifyMerchantZodSchema>;
export type IAdminUpdateMerchantStatusPayload = z.infer<typeof adminUpdateMerchantStatusZodSchema>;

export const merchantValidation = {
  registerMerchantZodSchema,
  merchantEmailVerifyZodSchema,
  updateMerchantProfileZodSchema,
  verifyMerchantZodSchema,
  adminUpdateMerchantStatusZodSchema,
};