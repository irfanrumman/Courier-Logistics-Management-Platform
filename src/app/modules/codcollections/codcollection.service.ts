import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { CodCollectionWhereInput } from "../../../generated/prisma/models";
import {
  IRecordCollectionPayload,
  IMarkRemittedPayload,
} from "./codcollection.validation";
import { IQueryForCodCollection } from "./codcollection.interface";

// ==========================================================
// ১. Courier delivery সম্পন্ন করার সময় কত টাকা receiver থেকে নিলো সেটা রেকর্ড করা —
// শুধু LAST_MILE courier যাকে shipment এ assign করা আছে, সেই নিজের collection record করতে পারবে
// ==========================================================
const recordCollection = async (payload: IRecordCollectionPayload, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: payload.shipmentId },
    include: { codCollection: true },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (shipment.paymentType !== "COD") {
    throw new AppError(httpStatus.BAD_REQUEST, "This Shipment Is Not Cash-On-Delivery");
  }

  // যে courier record করছে, সেই courier এর CourierMan profile খুঁজছি (userId দিয়ে)
  const courierMan = await prisma.courierMan.findUnique({ where: { userId: user.userId } });

  if (!courierMan) {
    throw new AppError(httpStatus.FORBIDDEN, "Courier Man Profile Not Found");
  }

  // শুধু এই shipment এ assigned last-mile courier ই collection record করতে পারবে
  if (shipment.lastMileCourierManId !== courierMan.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You Are Not Assigned As The Last-Mile Courier For This Shipment",
    );
  }

  // একটা shipment এর জন্য একটাই CodCollection row (schema তে shipmentId @unique)
  if (shipment.codCollection) {
    throw new AppError(httpStatus.CONFLICT, "Collection Has Already Been Recorded For This Shipment");
  }

  // Collected amount shipment এর codAmount এর সাথে মিলছে কিনা যাচাই — mismatch হলে সতর্ক করা উচিত,
  // কিন্তু সম্পূর্ণ আটকাচ্ছি না (courier হয়তো কম/বেশি নিয়েছে, সেটাও রেকর্ড থাকা দরকার)
  if (shipment.codAmount && payload.amountCollected !== shipment.codAmount.toNumber()) {
    // শুধু log/note রাখার মতো জায়গা, এখানে শুধু আটকাচ্ছি না — চাইলে admin পরে review করবে
  }

  const collection = await prisma.$transaction(async (tx) => {
    const newCollection = await tx.codCollection.create({
      data: {
        shipmentId: payload.shipmentId,
        amountCollected: payload.amountCollected,
        collectedAt: new Date(),
        collectedByCourierManId: courierMan.id,
      },
    });

    // Collection record হওয়ার সাথে সাথে shipment DELIVERED হয়ে যাওয়া স্বাভাবিক —
    // কিন্তু status update আলাদা endpoint এ হয় (shipment.updateShipmentStatus), এখানে touch করছি না,
    // যাতে দুটো module এর দায়িত্ব আলাদা থাকে (single responsibility)

    return newCollection;
  });

  return collection;
};

// ==========================================================
// ২. Admin/Hub Manager sender কে টাকা পাঠানোর পর remittance mark করা
// ==========================================================
const markRemitted = async (codCollectionId: string, payload: IMarkRemittedPayload) => {
  const existingCollection = await prisma.codCollection.findUnique({
    where: { id: codCollectionId },
  });

  if (!existingCollection) {
    throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
  }

  if (existingCollection.isRemittedToSender) {
    throw new AppError(httpStatus.CONFLICT, "This Collection Has Already Been Remitted");
  }

  if (payload.remittedAmount > existingCollection.amountCollected.toNumber()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Remitted amount cannot exceed the collected amount",
    );
  }

  const updatedCollection = await prisma.codCollection.update({
    where: { id: codCollectionId },
    data: {
      isRemittedToSender: true,
      remittedAmount: payload.remittedAmount,
      remittedAt: new Date(),
    },
  });

  return updatedCollection;
};

// ==========================================================
// ৩. Admin এর জন্য সব collection list — বিশেষ করে "কোনগুলো এখনো remit করা হয়নি"
// এই filter দিয়ে quick দেখা যাবে কোন merchant/sender দের টাকা এখনো বাকি
// ==========================================================
const getAllCollections = async (query: IQueryForCodCollection) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: CodCollectionWhereInput[] = [];

  if (query.isRemittedToSender !== undefined) {
    andConditions.push({ isRemittedToSender: query.isRemittedToSender === "true" });
  }

  if (query.courierManId) {
    andConditions.push({ collectedByCourierManId: query.courierManId });
  }

  const collections = await prisma.codCollection.findMany({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      shipment: {
        select: {
          id: true,
          trackingNumber: true,
          codAmount: true,
          sender: { select: { id: true, name: true, email: true } },
        },
      },
      collectedByCourierMan: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const total = await prisma.codCollection.count({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
  });

  return {
    data: collections,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ==========================================================
// ৪. Single collection দেখা
// ==========================================================
const getSingleCollection = async (codCollectionId: string) => {
  const collection = await prisma.codCollection.findUnique({
    where: { id: codCollectionId },
    include: {
      shipment: { include: { sender: { select: { id: true, name: true, email: true } } } },
      collectedByCourierMan: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!collection) {
    throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
  }

  return collection;
};

// ==========================================================
// ৫. একজন courier নিজে যা যা collect করেছে তার history দেখা (self-service)
// ==========================================================
const getMyCollections = async (query: IQueryForCodCollection, user: RequestUser) => {
  const courierMan = await prisma.courierMan.findUnique({ where: { userId: user.userId } });

  if (!courierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Profile Not Found");
  }

  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const collections = await prisma.codCollection.findMany({
    where: { collectedByCourierManId: courierMan.id },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      shipment: { select: { id: true, trackingNumber: true, receiverName: true } },
    },
  });

  const total = await prisma.codCollection.count({
    where: { collectedByCourierManId: courierMan.id },
  });

  return {
    data: collections,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const CodCollectionServices = {
  recordCollection,
  markRemitted,
  getAllCollections,
  getSingleCollection,
  getMyCollections,
};