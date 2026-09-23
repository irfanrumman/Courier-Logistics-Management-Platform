import { z } from "zod";

export const initiatePaymentZodSchema = z.object({
  shipmentId: z.string().uuid("Invalid shipment ID"),
  method: z.enum(["BKASH", "CASH_ON_DELIVERY"]),
});

export const confirmPaymentZodSchema = z.object({
  shipmentId: z.string().uuid("Invalid shipment ID"),
  gatewayTransactionId: z.string().trim().min(1, "Transaction ID is required"), // bKash trxID
  gatewayReferenceId: z.string().trim().optional(), // bKash paymentID
  gatewayResponse: z.record(z.string(), z.any()).optional(),
});

export const refundPaymentZodSchema = z.object({
  refundAmount: z.number().positive("Refund amount must be greater than 0"),
  refundReason: z.string().trim().min(1, "Refund reason is required"),
});

export type IInitiatePaymentPayload = z.infer<typeof initiatePaymentZodSchema>;
export type IConfirmPaymentPayload = z.infer<typeof confirmPaymentZodSchema>;
export type IRefundPaymentPayload = z.infer<typeof refundPaymentZodSchema>;

export const paymentValidation = {
  initiatePaymentZodSchema,
  confirmPaymentZodSchema,
  refundPaymentZodSchema,
};