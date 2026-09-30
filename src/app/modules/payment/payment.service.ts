import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { PaymentWhereInput } from "../../../generated/prisma/models";
import { HubManagerStatus, HubManagerVerificationStatus, PaymentStatus, Role, UserStatus } from "../../../generated/prisma/enums";
import { IQueryForPayment } from "./payment.interface";


const getMyPayments = async (query: IQueryForPayment, user: RequestUser) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: PaymentWhereInput[] = [
    { shipment: { senderId: user.userId } },
  ];

  if (query.status) {
    andConditions.push({ status: query.status as PaymentStatus });
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


const getSinglePayment = async (paymentId: string, user: RequestUser) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      shipment: {
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  const isOwner = payment.shipment.senderId === user.userId;
  const isAdmin =
    user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

  if (isOwner || isAdmin) {
    return payment;
  }

  
  if (user.role === Role.HUB_MANAGER) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { hubManager: true },
    });

    if (
      !dbUser ||
      dbUser.isDeleted ||
      dbUser.status !== UserStatus.ACTIVE ||
      !dbUser.hubManager ||
      dbUser.hubManager.isDeleted ||
      dbUser.hubManager.status !== HubManagerStatus.ACTIVE ||
      dbUser.hubManager.verificationStatus !==
        HubManagerVerificationStatus.APPROVED ||
      !dbUser.hubManager.hubId
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Your hub manager account is inactive or not assigned to a hub",
      );
    }

    const hubId = dbUser.hubManager.hubId;
    const shipment = payment.shipment;

    if (
      shipment.originHubId !== hubId &&
      shipment.destinationHubId !== hubId
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You can only view payments related to your hub",
      );
    }

    return payment;
  }

  throw new AppError(
    httpStatus.FORBIDDEN,
    "You Are Not Allowed To View This Payment",
  );
};


export const PaymentServices = {
  getMyPayments,
  getAllPayments,
  getSinglePayment,
};