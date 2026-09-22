import crypto from "crypto";
import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { ShipmentStatus, ShipmentWhereInput } from "../../../generated/prisma/models";
import { PricingRuleServices } from "../pricingRule/pricingrule.service";
import {
  ICreateShipmentPayload,
  IUpdateShipmentStatusPayload,
  IAssignCourierPayload,
} from "./shipment.validation";
import { IQueryForShipment } from "./shipment.interface";

// Tracking number generate করার helper — human-readable, unique হওয়া দরকার
// Format: CLM + বছর + ৮ hex character (random, collision practically অসম্ভব)
const generateTrackingNumber = (): string => {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CLM-${year}-${random}`;
};

// Shipment এর কাজ যেসব status এ "শেষ" হয়ে যায় (courier আর দরকার নেই) —
// এই status গুলোতে পৌঁছালে সংশ্লিষ্ট courier কে আবার available করে দিতে হবে
const TERMINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "FAILED_DELIVERY", "RETURNED"];

// ==========================================================
// ১. Shipment তৈরি — Customer/Merchant দুজনেই ব্যবহার করবে
// deliveryCharge এখন PricingRuleServices.calculatePrice() দিয়ে আসল rule অনুযায়ী হিসাব হচ্ছে
// ==========================================================
const createShipment = async (payload: ICreateShipmentPayload, user: RequestUser) => {
  const originHub = await prisma.hub.findUnique({ where: { id: payload.originHubId } });
  if (!originHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Origin Hub Not Found");
  }

  const destinationHub = await prisma.hub.findUnique({ where: { id: payload.destinationHubId } });
  if (!destinationHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Destination Hub Not Found");
  }

  // totalWeightKg = প্রতিটা parcel এর (weightKg * quantity) যোগফল
  const totalWeightKg = payload.parcels.reduce(
    (sum, parcel) => sum + parcel.weightKg * parcel.quantity,
    0,
  );

  const deliveryCharge = await PricingRuleServices.calculatePrice(
    originHub.zoneId,
    destinationHub.zoneId,
    totalWeightKg,
  );

  const trackingNumber = generateTrackingNumber();

  const shipment = await prisma.$transaction(async (tx) => {
    const createdShipment = await tx.shipment.create({
      data: {
        trackingNumber,
        senderId: user.userId,

        senderAddressLine: payload.senderAddressLine,
        senderDistrict: payload.senderDistrict,
        senderThana: payload.senderThana,
        senderPostalCode: payload.senderPostalCode,
        senderLandmark: payload.senderLandmark,

        receiverName: payload.receiverName,
        receiverPhone: payload.receiverPhone,
        receiverAddressLine: payload.receiverAddressLine,
        receiverDistrict: payload.receiverDistrict,
        receiverThana: payload.receiverThana,
        receiverPostalCode: payload.receiverPostalCode,
        receiverLandmark: payload.receiverLandmark,

        originHubId: payload.originHubId,
        destinationHubId: payload.destinationHubId,

        totalWeightKg,
        deliveryCharge,
        paymentType: payload.paymentType,
        codAmount: payload.paymentType === "COD" ? payload.codAmount : null,

        status: "PENDING",

        parcels: {
          create: payload.parcels.map((parcel) => ({
            description: parcel.description,
            category: parcel.category,
            quantity: parcel.quantity,
            weightKg: parcel.weightKg,
            declaredValue: parcel.declaredValue,
            isFragile: parcel.isFragile,
          })),
        },

        statusHistory: {
          create: {
            status: "PENDING",
            note: "Shipment created",
            updatedById: user.userId,
          },
        },
      },
      include: {
        parcels: true,
        statusHistory: true,
        originHub: true,
        destinationHub: true,
      },
    });

    return createdShipment;
  });

  return shipment;
};

// ==========================================================
// ২. নিজের পাঠানো সব shipment দেখা (customer/merchant)
// ==========================================================
const getMyShipments = async (user: RequestUser, query: IQueryForShipment) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ShipmentWhereInput[] = [{ senderId: user.userId }];

  if (query.status) {
    andConditions.push({ status: query.status as ShipmentStatus });
  }

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { trackingNumber: { contains: query.searchTerm, mode: "insensitive" } },
        { receiverName: { contains: query.searchTerm, mode: "insensitive" } },
        { receiverPhone: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  const shipments = await prisma.shipment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      parcels: true,
      originHub: true,
      destinationHub: true,
      payment: true,
    },
  });

  const totalCount = await prisma.shipment.count({ where: { AND: andConditions } });

  return {
    data: shipments,
    meta: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
  };
};

// ==========================================================
// ৩. Tracking number দিয়ে shipment খোঁজা — public
// ==========================================================
const getShipmentByTrackingNumber = async (trackingNumber: string) => {
  const shipment = await prisma.shipment.findUnique({
    where: { trackingNumber },
    include: {
      parcels: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      originHub: true,
      destinationHub: true,
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found With This Tracking Number");
  }

  return shipment;
};

// ==========================================================
// ৪. Admin/Hub Manager এর জন্য single shipment by ID
// ==========================================================
const getSingleShipmentById = async (shipmentId: string) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      sender: { omit: { password: true } },
      parcels: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      originHub: true,
      destinationHub: true,
      transferCourierMan: { include: { user: { omit: { password: true } } } },
      lastMileCourierMan: { include: { user: { omit: { password: true } } } },
      payment: true,
      codCollection: true,
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  return shipment;
};

// ==========================================================
// ৫. Admin/Hub Manager এর জন্য সব shipment list
// ==========================================================
const getAllShipments = async (query: IQueryForShipment) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ShipmentWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { trackingNumber: { contains: query.searchTerm, mode: "insensitive" } },
        { receiverName: { contains: query.searchTerm, mode: "insensitive" } },
        { receiverPhone: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.status) {
    andConditions.push({ status: query.status as ShipmentStatus });
  }

  if (query.paymentType) {
    andConditions.push({ paymentType: query.paymentType as any });
  }

  if (query.originHubId) {
    andConditions.push({ originHubId: query.originHubId });
  }

  if (query.destinationHubId) {
    andConditions.push({ destinationHubId: query.destinationHubId });
  }

  const shipments = await prisma.shipment.findMany({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      sender: { omit: { password: true } },
      originHub: true,
      destinationHub: true,
    },
  });

  const totalCount = await prisma.shipment.count({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
  });

  return {
    data: shipments,
    meta: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
  };
};

// ==========================================================
// ৬. Status আপডেট — status change এর সাথে সাথে statusHistory তে entry তৈরি হয়,
// আর যদি নতুন status TERMINAL (DELIVERED/FAILED_DELIVERY/RETURNED) হয়, তাহলে
// সংশ্লিষ্ট courier (transfer এবং/অথবা last-mile, যে যেটাতে assigned) কে
// আবার isAvailable = true করে দেওয়া হচ্ছে — তাদের কাজ শেষ, নতুন shipment নিতে পারবে
// ==========================================================
const updateShipmentStatus = async (
  shipmentId: string,
  payload: IUpdateShipmentStatusPayload,
  updater: RequestUser,
) => {
  const existingShipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
  });

  if (!existingShipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (TERMINAL_STATUSES.includes(existingShipment.status)) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Shipment is already in a final state (${existingShipment.status}), status cannot be changed further`,
    );
  }

  const isNewStatusTerminal = TERMINAL_STATUSES.includes(payload.status);

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: payload.status,
        // নতুন status অনুযায়ী সংশ্লিষ্ট field গুলো বসানো — main table এ denormalized রাখছি
        deliveredAt: payload.status === "DELIVERED" ? new Date() : undefined,
        returnedAt: payload.status === "RETURNED" ? new Date() : undefined,
        failureReason: payload.status === "FAILED_DELIVERY" ? payload.note : undefined,
        // FAILED_DELIVERY হলেই attempt count বাড়বে, বাকি status এ অপরিবর্তিত থাকবে
        deliveryAttemptCount:
          payload.status === "FAILED_DELIVERY" ? { increment: 1 } : undefined,
      },
    });

    // History entry — এটা প্রতিটা status change এর জন্যই হচ্ছে, আগের মতোই
    await tx.shipmentStatusHistory.create({
      data: {
        shipmentId,
        status: payload.status,
        note: payload.note, // এই note ই আসল, granular history হিসেবে থেকে যাবে
        updatedById: updater.userId,
      },
    });

    if (isNewStatusTerminal) {
      const courierIdsToFree = [
        existingShipment.transferCourierManId,
        existingShipment.lastMileCourierManId,
      ].filter((id): id is string => id !== null);

      if (courierIdsToFree.length > 0) {
        await tx.courierMan.updateMany({
          where: { id: { in: courierIdsToFree } },
          data: { isAvailable: true },
        });
      }
    }

    return shipment;
  });

  return updatedShipment;
};
// ==========================================================
// ৭. Courier assign করা — assign হওয়ার সাথে সাথে সেই courier কে busy মার্ক
// করে দেওয়া হচ্ছে (isAvailable: false), যাতে একসাথে একাধিক shipment না পায়
// ==========================================================
const assignCourier = async (
  shipmentId: string,
  payload: IAssignCourierPayload,
  updater: RequestUser,
) => {
  const existingShipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!existingShipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  const courierMan = await prisma.courierMan.findUnique({ where: { id: payload.courierManId } });
  if (!courierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Not Found");
  }

  if (courierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "This Courier Man Has Been Deleted");
  }

  if (!courierMan.isAvailable) {
    throw new AppError(httpStatus.CONFLICT, "This Courier Man Is Not Available Right Now");
  }

  if (payload.assignmentType === "TRANSFER" && courierMan.courierType !== "HUB_TRANSFER") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only HUB_TRANSFER type courier men can be assigned for transfer",
    );
  }

  if (payload.assignmentType === "LAST_MILE" && courierMan.courierType !== "LAST_MILE") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only LAST_MILE type courier men can be assigned for last-mile delivery",
    );
  }

  const updateData =
    payload.assignmentType === "TRANSFER"
      ? { transferCourierManId: payload.courierManId }
      : { lastMileCourierManId: payload.courierManId };

  const newStatus: ShipmentStatus =
    payload.assignmentType === "TRANSFER" ? "COURIER_ASSIGNED" : "OUT_FOR_DELIVERY";

  const updatedShipment = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.update({
      where: { id: shipmentId },
      data: { ...updateData, status: newStatus },
      include: {
        transferCourierMan: { include: { user: { omit: { password: true } } } },
        lastMileCourierMan: { include: { user: { omit: { password: true } } } },
      },
    });

    await tx.shipmentStatusHistory.create({
      data: {
        shipmentId,
        status: newStatus,
        note: `Assigned to courier (${payload.assignmentType})`,
        updatedById: updater.userId,
      },
    });

    await tx.courierMan.update({
      where: { id: payload.courierManId },
      data: { isAvailable: false },
    });

    return shipment;
  });

  return updatedShipment;
};

export const ShipmentServices = {
  createShipment,
  getMyShipments,
  getShipmentByTrackingNumber,
  getSingleShipmentById,
  getAllShipments,
  updateShipmentStatus,
  assignCourier,
};