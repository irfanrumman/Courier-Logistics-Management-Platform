import { z } from "zod";


const parcelZodSchema = z.object({
  description: z.string().trim().min(1, "Parcel description is required"),
  category: z.string().trim().optional(),
  quantity: z.number().int().positive().default(1),
  weightKg: z.number().positive("Weight must be greater than 0"),
  declaredValue: z.number().nonnegative().optional(),
  isFragile: z.boolean().default(false),
});

export const createShipmentZodSchema = z
  .object({
    senderAddressLine: z.string().trim().min(1, "Sender address is required"),
    senderDistrict: z.string().trim().min(1, "Sender district is required"),
    senderThana: z.string().trim().min(1, "Sender thana is required"),
    senderPostalCode: z.string().trim().optional(),
    senderLandmark: z.string().trim().optional(),

    receiverName: z.string().trim().min(1, "Receiver name is required"),
    receiverPhone: z.string().trim().min(1, "Receiver phone is required"),
    receiverAddressLine: z.string().trim().min(1, "Receiver address is required"),
    receiverDistrict: z.string().trim().min(1, "Receiver district is required"),
    receiverThana: z.string().trim().min(1, "Receiver thana is required"),
    receiverPostalCode: z.string().trim().optional(),
    receiverLandmark: z.string().trim().optional(),

    originHubId: z.string().uuid("Invalid origin hub ID"),
    destinationHubId: z.string().uuid("Invalid destination hub ID"),

    paymentType: z.enum(["PREPAID", "COD"]).default("PREPAID"),
    // COD হলে codAmount বাধ্যতামূলক — নিচে .refine() দিয়ে চেক করছি
    codAmount: z.number().positive().optional(),

    parcels: z.array(parcelZodSchema).min(1, "At least one parcel is required"),
  })
  // originHub আর destinationHub একই হতে পারবে না — যুক্তিসঙ্গত validation
  .refine((data) => data.originHubId !== data.destinationHubId, {
    message: "Origin and destination hub cannot be the same",
    path: ["destinationHubId"],
  })
  // COD হলে codAmount থাকতেই হবে
  .refine((data) => data.paymentType !== "COD" || !!data.codAmount, {
    message: "COD amount is required when payment type is COD",
    path: ["codAmount"],
  });

// Status update করার সময় শুধু status + optional note নেওয়া হচ্ছে,
// courier assignment আলাদা endpoint এ (নিচে দেখো)
export const updateShipmentStatusZodSchema = z.object({
  status: z.enum([
    "PICKUP_REQUESTED",
    "COURIER_ASSIGNED",
    "PICKED_UP",
    "AT_ORIGIN_HUB",
    "IN_TRANSIT",
    "AT_DESTINATION_HUB",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED_DELIVERY",
    "RETURNED",
  ]),
  note: z.string().trim().optional(),
});

// Courier assign করার জন্য আলাদা schema — transfer আর last-mile দুটোর একটা নির্দিষ্ট করে দিতে হবে
export const assignCourierZodSchema = z.object({
  courierManId: z.string().uuid("Invalid courier man ID"),
  assignmentType: z.enum(["TRANSFER", "LAST_MILE"]),
});


// আগের createShipmentZodSchema এর ভেতরের parcelZodSchema-ই এখানে reuse করা যায়,
// কিন্তু single parcel add করার জন্য আলাদা schema (array না, single object)
export const addParcelZodSchema = z.object({
  description: z.string().trim().min(1, "Parcel description is required"),
  category: z.string().trim().optional(),
  quantity: z.number().int().positive().default(1),
  weightKg: z.number().positive("Weight must be greater than 0"),
  declaredValue: z.number().nonnegative().optional(),
  isFragile: z.boolean().default(false),
});

// Update করার সময় সব field optional — partial update
export const updateParcelZodSchema = z.object({
  description: z.string().trim().min(1).optional(),
  category: z.string().trim().optional(),
  quantity: z.number().int().positive().optional(),
  weightKg: z.number().positive().optional(),
  declaredValue: z.number().nonnegative().optional(),
  isFragile: z.boolean().optional(),
});

export type IAddParcelPayload = z.infer<typeof addParcelZodSchema>;
export type IUpdateParcelPayload = z.infer<typeof updateParcelZodSchema>;

export type ICreateShipmentPayload = z.infer<typeof createShipmentZodSchema>;
export type IUpdateShipmentStatusPayload = z.infer<typeof updateShipmentStatusZodSchema>;
export type IAssignCourierPayload = z.infer<typeof assignCourierZodSchema>;

export const shipmentValidation = {
  createShipmentZodSchema,
  updateShipmentStatusZodSchema,
  assignCourierZodSchema,
    addParcelZodSchema,       
  updateParcelZodSchema
};