import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { CodCollectionWhereInput } from "../../../generated/prisma/models";
import {
  IRecordCollectionPayload,
  IMarkRemittedPayload,
  IConfirmHubReceiptPayload,
} from "./codcollection.validation";
import { IQueryForCodCollection } from "./codcollection.interface";
import { ShipmentStatus } from "../../../generated/prisma/enums";



const recordCollection = async (payload: IRecordCollectionPayload, user: RequestUser) => {

  const shipment = await prisma.shipment.findUnique({
    where: { id: payload.shipmentId },
    include: { codCollection: true },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (!shipment.codAmount) {
    throw new AppError(httpStatus.BAD_REQUEST, "This Shipment Is Not Cash-On-Delivery");
  }

  if (shipment.codAmount === null) {
  throw new AppError(
    httpStatus.BAD_REQUEST,
    "This Shipment Is Not Cash-On-Delivery",
  );
}

if (shipment.status !== ShipmentStatus.OUT_FOR_DELIVERY) {
  throw new AppError(
    httpStatus.BAD_REQUEST,
    "COD Can Only Be Collected For Shipments Out For Delivery",
  );
}

if (payload.amountCollected <= 0) {
  throw new AppError(
    httpStatus.BAD_REQUEST,
    "Collected Amount Must Be Greater Than Zero",
  );
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


    return newCollection;
  });

  return collection;
};


const confirmHubReceipt = async (payload: IConfirmHubReceiptPayload, user: RequestUser) => {

  const existingCollection = await prisma.codCollection.findUnique({
    where: { id: payload.codCollectionId },
    include: {
      shipment: { select: { originHubId: true, destinationHubId: true } },
    },

  });

  if (!existingCollection) {
    throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
  }

  if (existingCollection.submittedToHubAt) {
    throw new AppError(httpStatus.CONFLICT, "This Collection Has Already Been Confirmed By A Hub");
  }

  const hubManager = await prisma.hubManager.findUnique({ 
    where: { userId: user.userId } 
  });

 if (!hubManager || hubManager.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, "Hub Manager Profile Not Found");
  }

  if (!hubManager.hubId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not assigned to any hub",
    );
  }

  const { originHubId, destinationHubId } = existingCollection.shipment;

  if (
    originHubId !== hubManager.hubId &&
    destinationHubId !== hubManager.hubId
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You can only confirm COD collections related to your hub",
    );
  }

  const updatedCollection = await prisma.codCollection.update({
    where: { id: payload.codCollectionId },
    data: {
      submittedToHubAt: new Date(),
      receivedByHubManagerId: hubManager.id,
      receivedAtHubId: hubManager.hubId
    },
    include: {
      shipment: { select: { id: true, trackingNumber: true } },
      collectedByCourierMan: { include: { user: { select: { id: true, name: true } } } },

      receivedByHubManager: {
        include: { hub: true }, 
      },
    },
   
  });

  return updatedCollection;
};


const markRemitted = async (codCollectionId: string, payload: IMarkRemittedPayload) => {

  const existingCollection = await prisma.codCollection.findUnique({
    where: { id: codCollectionId },
  });

  if (!existingCollection) {
    throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
  }

   if (!existingCollection.submittedToHubAt) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This amount has not been submitted to and confirmed by the hub yet",
    );
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

// codcollection.service.ts এ যোগ করো
const getMySenderCODCollections = async (query: IQueryForCodCollection, user: RequestUser) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: CodCollectionWhereInput[] = [
    { shipment: { senderId: user.userId } }, // নিজের পাঠানো shipment এর collection গুলোই
  ];

  if (query.isRemittedToSender !== undefined) {
    andConditions.push({ isRemittedToSender: query.isRemittedToSender === "true" });
  }

  const collections = await prisma.codCollection.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      shipment: { select: { id: true, trackingNumber: true, codAmount: true } },
    },
  });

  const total = await prisma.codCollection.count({ where: { AND: andConditions } });

  return {
    data: collections,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const CodCollectionServices = {
  recordCollection,
   confirmHubReceipt,
  markRemitted,
  getAllCollections,
  getSingleCollection,
  getMyCollections,
  getMySenderCODCollections,
};