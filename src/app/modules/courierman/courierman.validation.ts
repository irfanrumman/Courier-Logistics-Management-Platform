import { z } from "zod";
import { CourierManAssignType } from "../../../generated/prisma/enums";

export const applyAsCourierManZodSchema = z.object({
	user: z.object({
		name: z.string().trim().min(2, "Name must be at least 2 characters long"),
		email: z.email("Invalid email address").trim().toLowerCase(),
		phone: z.string().trim().optional(),
		gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
	}),
	courierMan: z.object({
		courierManAssignType: z.enum([
			CourierManAssignType.HUB_TRANSFER,
			CourierManAssignType.LAST_MILE,
		]),
		vehicleType: z.string().trim().optional(),
		vehicleNumber: z.string().trim().optional(),
		licenseNumber: z.string().trim().optional(),
		maxCapacity: z.number().int().positive().optional(),
		bio: z.string().trim().max(1000).optional(),
		qualifications: z.string().trim().optional(),
		experienceYears: z.number().int().min(0).optional(),
	}),
});

export const courierManEmailVerifyZodSchema = z.object({
	email: z.email("Invalid email address"),
	otp: z.string().length(6, "OTP must be 6 digits"),
});

export const approveCourierManZodSchema = z
	.object({
		courierManId: z.string().uuid("Invalid courier man ID"),
		verificationStatus: z.enum(["APPROVED", "REJECTED"]),
		rejectionReason: z.string().trim().optional(),
	})
	.refine(
		(data) => data.verificationStatus !== "REJECTED" || !!data.rejectionReason,
		{
			message: "Rejection reason is required when rejecting",
			path: ["rejectionReason"],
		},
	);

export const updateCourierManProfileZodSchema = z.object({
	user: z
		.object({
			name: z.string().trim().min(2).optional(),
			phone: z.string().trim().optional(),
			gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
		})
		.optional(),
	courierMan: z
		.object({
			vehicleType: z.string().trim().optional(),
			vehicleNumber: z.string().trim().optional(),
			bio: z.string().trim().max(1000).optional(),
			qualifications: z.string().trim().optional(),
			experienceYears: z.number().int().min(0).optional(),
		})
		.optional(),
});

export const toggleAvailabilityZodSchema = z.object({
	isAvailable: z.boolean(),
});

export const updateLocationZodSchema = z.object({
	currentLatitude: z.number().min(-90).max(90),
	currentLongitude: z.number().min(-180).max(180),
});

export const adminUpdateCourierManZodSchema = z.object({
	currentHubId: z.string().uuid("Invalid hub ID").optional(),
	zoneId: z.string().uuid("Invalid zone ID").optional(),
	currentStatus: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED"]).optional(),
});

export type IApplyAsCourierManPayload = z.infer<
	typeof applyAsCourierManZodSchema
>;
export type ICourierManEmailVerifyPayload = z.infer<
	typeof courierManEmailVerifyZodSchema
>;
export type IApproveCourierManPayload = z.infer<
	typeof approveCourierManZodSchema
>;
export type IUpdateCourierManProfilePayload = z.infer<
	typeof updateCourierManProfileZodSchema
>;
export type IToggleAvailabilityPayload = z.infer<
	typeof toggleAvailabilityZodSchema
>;
export type IUpdateLocationPayload = z.infer<typeof updateLocationZodSchema>;
export type IAdminUpdateCourierManPayload = z.infer<
	typeof adminUpdateCourierManZodSchema
>;

export const courierManValidation = {
	applyAsCourierManZodSchema,
	courierManEmailVerifyZodSchema,
	approveCourierManZodSchema,
	updateCourierManProfileZodSchema,
	toggleAvailabilityZodSchema,
	updateLocationZodSchema,
	adminUpdateCourierManZodSchema,
};
