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
import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";

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


const recalculateShipmentWeightAndPrice = async (shipmentId: string) => {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { parcels: true, originHub: true, destinationHub: true },
  });

  // প্রতিটা parcel এর (weightKg * quantity) যোগফল — createShipment এ যেভাবে
  // প্রথমবার হিসাব করা হয়েছিল, ঠিক সেই একই logic এখানে পুনরায় প্রয়োগ করা হচ্ছে
  const newTotalWeightKg = shipment.parcels.reduce(
    (sum, parcel) => sum + parcel.weightKg.toNumber() * parcel.quantity,
    0,
  );

  // নতুন weight অনুযায়ী আবার PricingRule থেকে delivery charge বের করা হচ্ছে,
  // কারণ weight bracket বদলে গেলে rate ও বদলে যেতে পারে
  const newDeliveryCharge = await PricingRuleServices.calculatePrice(
    shipment.originHub.zoneId,
    shipment.destinationHub.zoneId,
    newTotalWeightKg,
  );

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      totalWeightKg: newTotalWeightKg,
      deliveryCharge: newDeliveryCharge,
    },
  });
};


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


// একটা helper — shipment এর totalWeightKg সবসময় parcel গুলোর যোগফল অনুযায়ী
// সঠিক থাকা উচিত, তাই parcel add/update/delete হলেই এই ফাংশন দিয়ে recalculate করবো


// ==========================================================
// ৮. নতুন parcel যোগ করা — শুধু PENDING status এ, sender নিজেই যোগ করবে (তাই senderId চেক করছি)
// যোগ করার পর shipment এর totalWeightKg/deliveryCharge recalculate হচ্ছে
// ==========================================================
const addParcel = async (shipmentId: string, payload: IAddParcelPayload, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  // শুধু নিজের shipment এ parcel যোগ করতে পারবে (অন্য কারো shipment এ না)
  if (shipment.senderId !== user.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Can Only Modify Your Own Shipments");
  }

  if (shipment.status !== "PENDING") {
    throw new AppError(
      httpStatus.CONFLICT,
      "Parcels can only be added while the shipment is still PENDING",
    );
  }

  const newParcel = await prisma.parcel.create({
    data: {
      shipmentId,
      description: payload.description,
      category: payload.category,
      quantity: payload.quantity,
      weightKg: payload.weightKg,
      declaredValue: payload.declaredValue,
      isFragile: payload.isFragile,
    },
  });

  await recalculateShipmentWeightAndPrice(shipmentId);

  return newParcel;
};


const updateParcel = async (
  shipmentId: string,
  parcelId: string,
  payload: IUpdateParcelPayload,
  user: RequestUser,
  file: Express.Multer.File | null,
) => {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (shipment.senderId !== user.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Can Only Modify Your Own Shipments");
  }

  if (shipment.status !== "PENDING") {
    throw new AppError(
      httpStatus.CONFLICT,
      "Parcels can only be updated while the shipment is still PENDING",
    );
  }

  const existingParcel = await prisma.parcel.findUnique({ where: { id: parcelId } });

  if (!existingParcel || existingParcel.shipmentId !== shipmentId) {
    throw new AppError(httpStatus.NOT_FOUND, "Parcel Not Found In This Shipment");
  }

  // ছবি upload করা হলে Cloudinary তে upload করে url/publicId বসাবো,
  // hub manager এর resume upload এর মতোই inline Promise pattern
  let imageUploadResult: { url?: string; publicId?: string } = {};

  if (file) {
    const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "auto" },
          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(httpStatus.INTERNAL_SERVER_ERROR, "No result returned from Cloudinary"),
              );
            }

            resolve(result);
          },
        )
        .end(file.buffer);
    });

    imageUploadResult = { url: uploadResult.secure_url, publicId: uploadResult.public_id };

    // পুরনো ছবি থাকলে Cloudinary থেকে delete করে দিচ্ছি, orphan file জমে থাকা এড়াতে
    if (existingParcel.parcelImagePublicId) {
      await cloudinary.uploader.destroy(existingParcel.parcelImagePublicId).catch(() => {
        // Delete fail হলেও update আটকাচ্ছি না, শুধু silently ignore
      });
    }
  }

  const updatedParcel = await prisma.parcel.update({
    where: { id: parcelId },
    data: {
      ...payload,
      parcelImageUrl: imageUploadResult.url,
      parcelImagePublicId: imageUploadResult.publicId,
    },
  });

  // যদি weight/quantity বদলে থাকে, তাহলে shipment এর total recalculate করা দরকার
  if (payload.weightKg !== undefined || payload.quantity !== undefined) {
    await recalculateShipmentWeightAndPrice(shipmentId);
  }

  return updatedParcel;
};

// ==========================================================
// ১০. Parcel মুছে ফেলা — শেষ parcel মুছতে দেওয়া হচ্ছে না (shipment এ অন্তত ১টা parcel থাকতেই হবে)
// ==========================================================
const deleteParcel = async (shipmentId: string, parcelId: string, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { parcels: true },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (shipment.senderId !== user.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You Can Only Modify Your Own Shipments");
  }

  if (shipment.status !== "PENDING") {
    throw new AppError(
      httpStatus.CONFLICT,
      "Parcels can only be removed while the shipment is still PENDING",
    );
  }

  const existingParcel = shipment.parcels.find((p) => p.id === parcelId);

  if (!existingParcel) {
    throw new AppError(httpStatus.NOT_FOUND, "Parcel Not Found In This Shipment");
  }

  // shipment এ এই একটাই parcel থাকলে মুছতে দিচ্ছি না — shipment তো খালি থাকতে পারে না
  if (shipment.parcels.length === 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot delete the only parcel in a shipment. Delete the shipment instead.",
    );
  }

  // Cloudinary তে ছবি থাকলে সেটাও clean up করছি
  if (existingParcel.parcelImagePublicId) {
    await cloudinary.uploader.destroy(existingParcel.parcelImagePublicId).catch(() => {});
  }

  await prisma.parcel.delete({ where: { id: parcelId } });

  await recalculateShipmentWeightAndPrice(shipmentId);

  return { message: "Parcel deleted successfully" };
};

export const ShipmentServices = {
  createShipment,
  getMyShipments,
  getShipmentByTrackingNumber,
  getSingleShipmentById,
  getAllShipments,
  updateShipmentStatus,
  assignCourier,
   addParcel,      
  updateParcel,   
  deleteParcel, 
};