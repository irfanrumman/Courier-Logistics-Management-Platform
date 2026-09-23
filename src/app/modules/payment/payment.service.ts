import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { PaymentWhereInput } from "../../../generated/prisma/models";
import { PaymentStatus } from "../../../generated/prisma/enums";
import {
  IInitiatePaymentPayload,
  IConfirmPaymentPayload,
  IRefundPaymentPayload,
} from "./payment.validation";
import { IQueryForPayment } from "./payment.interface";

// ==========================================================
// ১. Payment শুরু করা — shipment এর জন্য Payment row তৈরি হয়, এখনো UNPAID
// COD হলে এখানেই তৈরি হয়ে যাবে কিন্তু gateway call কিছু হবে না (delivery এর সময় paid হবে)
// ==========================================================
const initiatePayment = async (payload: IInitiatePaymentPayload, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: payload.shipmentId },
    include: { payment: true },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  // শুধু নিজের shipment এর জন্য payment initiate করতে পারবে
  if (shipment.senderId !== user.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Can Only Pay For Your Own Shipments");
  }

  // একটা shipment এর জন্য একটাই Payment row হবে (schema তে shipmentId @unique) —
  // তাই আগে থেকে থাকলে duplicate তৈরি করতে দিচ্ছি না
  if (shipment.payment) {
    throw new AppError(httpStatus.CONFLICT, "Payment Has Already Been Initiated For This Shipment");
  }

  // COD এর ক্ষেত্রে paymentGateway null থাকবে, কারণ কোনো external gateway involve না —
  // delivery এর সময় courier ক্যাশ কালেক্ট করবে (CodCollection module এর কাজ)
 // initiatePayment ফাংশনের ভেতরে এই অংশটুকু বদলাও:

const paymentGateway = payload.method === "CASH_ON_DELIVERY" ? null : "bkash"; // ← simplify করলাম, শুধু bkash এখন

const payment = await prisma.payment.create({
  data: {
    shipmentId: payload.shipmentId,
    amount: shipment.deliveryCharge,
    method: payload.method,
    paymentGateway,
    merchantInvoiceNumber: shipment.trackingNumber,
    payerReference: user.email,
    status: "UNPAID",
  },
});

  // ⚠️ এখানে বাস্তব bKash/SSLCommerz/Stripe SDK call করে redirect URL/checkout session
  // বানানো হবে — এটা প্রতিটা gateway এর নিজস্ব integration লাগবে, এখনো placeholder
  // যেমন: bKash হলে createPaymentSession() কল করে checkoutUrl রিটার্ন করতে হবে

  return payment;
};

// ==========================================================
// ২. Payment confirm করা — gateway callback/webhook থেকে, অথবা manual confirm route থেকে
// ==========================================================
const confirmPayment = async (payload: IConfirmPaymentPayload) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: payload.shipmentId },
    include: { payment: true },
  });

  if (!shipment || !shipment.payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found For This Shipment");
  }

  if (shipment.payment.status === "PAID") {
    throw new AppError(httpStatus.CONFLICT, "Payment Has Already Been Confirmed");
  }

  const updatedPayment = await prisma.payment.update({
    where: { shipmentId: payload.shipmentId },
    data: {
      status: "PAID",
      gatewayTransactionId: payload.gatewayTransactionId,
      gatewayReferenceId: payload.gatewayReferenceId,
      gatewayResponse: payload.gatewayResponse,
      paidAt: new Date(),
    },
  });

  return updatedPayment;
};

// ==========================================================
// ৩. নিজের সব payment দেখা (customer/merchant)
// ==========================================================
const getMyPayments = async (query: IQueryForPayment, user: RequestUser) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: PaymentWhereInput[] = [
    { shipment: { senderId: user.userId } }, // shipment relation দিয়ে নিজের payment গুলো ফিল্টার
  ];

  if (query.status) {
    andConditions.push({ status: query.status as PaymentStatus });
  }

  if (query.method) {
    andConditions.push({ method: query.method as any });
  }

  const payments = await prisma.payment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      shipment: {
        select: { id: true, trackingNumber: true, status: true, receiverName: true },
      },
    },
  });

  const total = await prisma.payment.count({ where: { AND: andConditions } });

  return {
    data: payments,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ==========================================================
// ৪. Admin এর জন্য সব payment (filter সহ)
// ==========================================================
const getAllPayments = async (query: IQueryForPayment) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: PaymentWhereInput[] = [];

  if (query.status) {
    andConditions.push({ status: query.status as PaymentStatus });
  }

  if (query.method) {
    andConditions.push({ method: query.method as any });
  }

  if (query.shipmentTrackingNumber) {
    andConditions.push({
      shipment: {
        trackingNumber: { contains: query.shipmentTrackingNumber, mode: "insensitive" },
      },
    });
  }

  const payments = await prisma.payment.findMany({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      shipment: {
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  const total = await prisma.payment.count({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
  });

  return {
    data: payments,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ==========================================================
// ৫. Single payment দেখা — owner (sender) অথবা admin দেখতে পারবে
// ==========================================================
const getSinglePayment = async (paymentId: string, user: RequestUser) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      shipment: {
        include: {
          sender: { select: { id: true, name: true, email: true, userId: true } },
        },
      },
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  // Customer হলে শুধু নিজের payment দেখতে পারবে, admin/hub manager সব দেখতে পারবে
  if (user.role === "CUSTOMER" && payment.shipment.senderId !== user.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Are Not Allowed To View This Payment");
  }

  return payment;
};

// ==========================================================
// ৬. Refund — Admin only, PAID payment কে REFUNDED এ নিয়ে যাওয়া
// ==========================================================
const refundPayment = async (paymentId: string, payload: IRefundPaymentPayload) => {
  const existingPayment = await prisma.payment.findUnique({ where: { id: paymentId } });

  if (!existingPayment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  if (existingPayment.status !== "PAID") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only PAID payments can be refunded",
    );
  }

  if (payload.refundAmount > existingPayment.amount.toNumber()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Refund amount cannot exceed the original payment amount",
    );
  }

  const refundedPayment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "REFUNDED",
      refundAmount: payload.refundAmount,
      refundReason: payload.refundReason,
      refundedAt: new Date(),
      // refundTransactionId এখানে বাস্তব gateway refund API call করার পর বসবে,
      // এই মুহূর্তে placeholder হিসেবে খালি রাখছি
    },
  });

  return refundedPayment;
};

export const PaymentServices = {
  initiatePayment,
  confirmPayment,
  getMyPayments,
  getAllPayments,
  getSinglePayment,
  refundPayment,
};