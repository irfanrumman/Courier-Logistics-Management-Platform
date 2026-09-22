import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import config from "../../config";
import { IQuery, IQueryForCourier } from "../../interfaces";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { CourierManVerificationStatus, Role } from "../../../generated/prisma/enums";
import { generateSystemPassword } from "../../utils/generateSystemPassword";
import { CourierManWhereInput } from "../../../generated/prisma/models";
import {
  IApplyAsCourierManPayload,
  ICourierManEmailVerifyPayload,
  IApproveCourierManPayload,
  IUpdateCourierManProfilePayload,
  IToggleAvailabilityPayload,
  IUpdateLocationPayload,
  IAdminUpdateCourierManPayload,
} from "./courierman.validation";

// ==========================================================
// ১. Registration — resume/file upload নেই এখানে (hub manager এর মতো নয়),
// কারণ courier man এর জন্য bio/resume optional, শুধু driving-related তথ্য গুরুত্বপূর্ণ
// ==========================================================
const applyAsCourierMan = async (payload: IApplyAsCourierManPayload) => {
  const isUserExists = await prisma.user.findUnique({
    where: { email: payload.user.email },
  });

  if (isUserExists) {
    throw new AppError(httpStatus.CONFLICT, "User already exists with this email");
  }

  // vehicleNumber/licenseNumber @unique — আগেই চেক করে নিলাম, নাহলে Prisma constraint error দিবে
  // (তখন error message কম বোধগম্য হয়, তাই আগেভাগে ভালো message দিলাম)
  if (payload.courierMan.vehicleNumber) {
    const existingVehicle = await prisma.courierMan.findUnique({
      where: { vehicleNumber: payload.courierMan.vehicleNumber },
    });
    if (existingVehicle) {
      throw new AppError(httpStatus.CONFLICT, "This vehicle number is already registered");
    }
  }

  if (payload.courierMan.licenseNumber) {
    const existingLicense = await prisma.courierMan.findUnique({
      where: { licenseNumber: payload.courierMan.licenseNumber },
    });
    if (existingLicense) {
      throw new AppError(httpStatus.CONFLICT, "This license number is already registered");
    }
  }

  const courierManApplication = await prisma.user.create({
    data: {
      name: payload.user.name,
      email: payload.user.email,
      phone: payload.user.phone,
      gender: payload.user.gender,
      role: Role.COURIER_MAN,
      courierMan: {
        create: {
          courierType: payload.courierMan.courierType,
          vehicleType: payload.courierMan.vehicleType,
          vehicleNumber: payload.courierMan.vehicleNumber,
          licenseNumber: payload.courierMan.licenseNumber,
          maxCapacity: payload.courierMan.maxCapacity,
          bio: payload.courierMan.bio,
          qualifications: payload.courierMan.qualifications,
          experienceYears: payload.courierMan.experienceYears,
        },
      },
    },
    include: { courierMan: true },
  });

  // OTP flow — hub manager এর সাথে হুবহু একই pattern, শুধু redis key prefix আলাদা
  const expirationSeconds = 60 * 60;
  const otpKey = `courierMan-application-otp:${payload.user.email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: { type: "EX", value: expirationSeconds },
  });

  const templatePath = path.join(process.cwd(), "src/app/templates/otp-for-one-hour.ejs");
  const html = await ejs.renderFile(templatePath, {
    name: payload.user.name,
    email: payload.user.email,
    otp: otpValue,
    expirationMinutes: expirationSeconds / 60,
  });

  await transporter.sendMail({
    from: { name: "Courier & Logistics Management", address: config.email_sender },
    to: payload.user.email,
    subject: "Courier Man Application - Email Verification",
    html,
  });

  return courierManApplication;
};

// ==========================================================
// ২. Email verify — hub manager এর সাথে identical logic
// ==========================================================
const verifyCourierManEmail = async (payload: ICourierManEmailVerifyPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email, role: Role.COURIER_MAN },
  });

  if (!existingUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Courier Man Application Not Found. Please Apply Again.",
    );
  }

  if (existingUser.emailVerified) {
    throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
  }

  const otpKey = `courierMan-application-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "OTP Expired. Your Application Window Has Closed, Please Apply Again.",
    );
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifiedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { courierMan: true },
  });

  return verifiedUser;
};

// ==========================================================
// ৩. Admin approve/reject — employeeId generate হচ্ছে না এখানে,
// কারণ CourierMan schema তে employeeId field-ই নেই (শুধু HubManager এর ছিল)
// ==========================================================
const approveCourierMan = async (payload: IApproveCourierManPayload, reviewer: RequestUser) => {
  const { courierManId, verificationStatus, rejectionReason } = payload;

  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { id: courierManId },
    include: { user: true },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Application Not Found");
  }

  if (existingCourierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Application Has Been Deleted");
  }

  if (!existingCourierMan.user.emailVerified) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Courier Man Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
    );
  }

  if (existingCourierMan.verificationStatus !== CourierManVerificationStatus.PENDING) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Courier Man Application Has Already Been ${existingCourierMan.verificationStatus.toLowerCase()}`,
    );
  }

  const isApproved = verificationStatus === CourierManVerificationStatus.APPROVED;

  // Approve হলেই password generate + email — reject হলে password লাগবেই না
  let randomPassword: string | null = null;
  if (isApproved) {
    randomPassword = generateSystemPassword();
    const hashedPassword = await bcrypt.hash(randomPassword, Number(config.bcrypt_salt_rounds));

    await prisma.user.update({
      where: { id: existingCourierMan.userId },
      data: { password: hashedPassword, needPasswordChange: true },
    });
  }

  const updatedCourierMan = await prisma.courierMan.update({
    where: { id: courierManId },
    data: {
      verificationStatus,
      rejectionReason: isApproved ? null : rejectionReason,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    },
    include: {
      user: { omit: { password: true } },
      currentHub: true,
      zone: true,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    `src/app/templates/${
      isApproved ? "application-approved.ejs" : "application-rejected.ejs"
    }`,
  );

  const html = await ejs.renderFile(templatePath, {
    name: updatedCourierMan.user.name,
    reason: updatedCourierMan.rejectionReason,
    roleName: "Courier Man",
    extraNote: isApproved ? "Once logged in, don't forget to mark yourself as available so you can start receiving deliveries." : undefined,
  });

  await transporter.sendMail({
    from: { name: "Courier & Logistics Management", address: config.email_sender },
    to: updatedCourierMan.user.email,
    subject: isApproved ? "Your Application Has Been Approved" : "Your Application Has Been Rejected",
    html,
  });

  if (isApproved && randomPassword) {
    const passwordTemplatePath = path.join(process.cwd(), "src/app/templates/generated-password.ejs");
    const passwordHtml = await ejs.renderFile(passwordTemplatePath, {
      name: updatedCourierMan.user.name,
      password: randomPassword,
    });

    await transporter.sendMail({
      from: { name: "Courier & Logistics Management", address: config.email_sender },
      to: updatedCourierMan.user.email,
      subject: "Your Password - Courier Man Application",
      html: passwordHtml,
    });
  }

  return updatedCourierMan;
};

// ==========================================================
// ৪. Admin list view — courierType, currentStatus, isAvailable দিয়ে filter সাপোর্ট করছে
// (hub manager এর hubCode/hubName filter এর মতোই, শুধু courier-specific field গুলো যোগ করলাম)
// ==========================================================
const getAllCourierMans = async (query: IQueryForCourier) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: CourierManWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { user: { name: { contains: query.searchTerm, mode: "insensitive" } } },
        { user: { email: { contains: query.searchTerm, mode: "insensitive" } } },
        { vehicleNumber: { contains: query.searchTerm, mode: "insensitive" } },
        { licenseNumber: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.courierType) {
    andConditions.push({ courierType: query.courierType as "HUB_TRANSFER" | "LAST_MILE" });
  }

  if (query.currentStatus) {
    andConditions.push({ currentStatus: query.currentStatus as any });
  }

  // isAvailable="true"/"false" — query string সবসময় string আসে, তাই compare করতে হবে
  if (query.isAvailable !== undefined) {
    andConditions.push({ isAvailable: query.isAvailable === "true" });
  }

  if (query.verificationStatus) {
    andConditions.push({ verificationStatus: query.verificationStatus as CourierManVerificationStatus });
  }

  if (query.hubCode) {
    andConditions.push({ currentHub: { code: { equals: query.hubCode, mode: "insensitive" } } });
  }

  andConditions.push({ isDeleted: false });

  const allCourierMans = await prisma.courierMan.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      user: { omit: { password: true } },
      currentHub: true,
      zone: true,
    },
  });

  const totalCourierManCount = await prisma.courierMan.count({ where: { AND: andConditions } });

  return {
    data: allCourierMans,
    meta: {
      page,
      limit,
      total: totalCourierManCount,
      totalPages: Math.ceil(totalCourierManCount / limit),
    },
  };
};

const getSingleCourierManById = async (courierManId: string) => {
  const courierMan = await prisma.courierMan.findUnique({
    where: { id: courierManId },
    include: {
      user: { omit: { password: true } },
      currentHub: true,
      zone: true,
    },
  });

  if (!courierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Not Found");
  }

  if (courierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Has Been Deleted");
  }

  return courierMan;
};

// ==========================================================
// ৫. নিজের profile আপডেট — hub manager এর pattern এ, শুধু courier fields ভিন্ন
// rating/totalDeliveries/verificationStatus কখনো এখানে থাকবে না (system/admin controlled)
// ==========================================================
const updateCourierManProfile = async (
  payload: IUpdateCourierManProfilePayload,
  user: RequestUser,
) => {
  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { userId: user.userId },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Profile Not Found");
  }

  if (existingCourierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Profile Has Been Deleted");
  }

  const result = await prisma.$transaction(async (tx) => {
    let updatedUser = null;
    let updatedCourierMan = null;

    if (payload.user) {
      const { name, phone, gender } = payload.user;
      updatedUser = await tx.user.update({
        where: { id: user.userId },
        data: { name, phone, gender },
        omit: { password: true },
      });
    }

    if (payload.courierMan) {
      const { vehicleType, vehicleNumber, bio, qualifications, experienceYears } = payload.courierMan;
      updatedCourierMan = await tx.courierMan.update({
        where: { userId: user.userId },
        data: { vehicleType, vehicleNumber, bio, qualifications, experienceYears },
      });
    }

    return { user: updatedUser, courierMan: updatedCourierMan };
  });

  return result;
};

// ==========================================================
// ৬. Availability toggle — courier নিজে "আমি এখন ফ্রি/ব্যস্ত" সেট করবে
// এটা আলাদা, ছোট, ঘন ঘন কল হওয়া endpoint (profile update এর সাথে মেশাইনি,
// কারণ mobile app থেকে এটা বারবার toggle হবে, পুরো profile payload পাঠানো অপচয়)
// ==========================================================
const toggleAvailability = async (payload: IToggleAvailabilityPayload, user: RequestUser) => {
  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { userId: user.userId },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Profile Not Found");
  }

  if (existingCourierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Profile Has Been Deleted");
  }

  // যদি admin কর্তৃক SUSPENDED/ON_LEAVE করা থাকে, নিজে available=true করতে পারবে না
  if (existingCourierMan.currentStatus !== "ACTIVE") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      `Cannot change availability while status is ${existingCourierMan.currentStatus}`,
    );
  }

  const updated = await prisma.courierMan.update({
    where: { userId: user.userId },
    data: { isAvailable: payload.isAvailable },
  });

  return updated;
};

// ==========================================================
// ৭. Live location update — courier এর mobile app থেকে বারবার call হবে
// (delivery tracking/nearest-courier lookup এর জন্য shipment assignment logic এ ব্যবহার হবে)
// ==========================================================
const updateLocation = async (payload: IUpdateLocationPayload, user: RequestUser) => {
  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { userId: user.userId },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Profile Not Found");
  }

  const updated = await prisma.courierMan.update({
    where: { userId: user.userId },
    data: {
      currentLatitude: payload.currentLatitude,
      currentLongitude: payload.currentLongitude,
    },
  });

  return updated;
};

// ==========================================================
// ৮. Admin update — hub/zone assign করা, currentStatus বদলানো (SUSPENDED/ON_LEAVE)
// ==========================================================
const adminUpdateCourierMan = async (
  courierManId: string,
  payload: IAdminUpdateCourierManPayload,
) => {
  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { id: courierManId },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Not Found");
  }

  if (existingCourierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Has Been Deleted");
  }

  if (payload.currentHubId) {
    const hub = await prisma.hub.findUnique({ where: { id: payload.currentHubId } });
    if (!hub) throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  if (payload.zoneId) {
    const zone = await prisma.zone.findUnique({ where: { id: payload.zoneId } });
    if (!zone) throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
  }

  const updatedCourierMan = await prisma.courierMan.update({
    where: { id: courierManId },
    data: {
      currentHubId: payload.currentHubId,
      zoneId: payload.zoneId,
      currentStatus: payload.currentStatus,
    },
    include: {
      user: { omit: { password: true } },
      currentHub: true,
      zone: true,
    },
  });

  return updatedCourierMan;
};

// ==========================================================
// ৯. Soft delete — hub manager pattern অনুসরণ করলাম, hubId/zoneId/status বদলাইনি
// (আগের আলোচনা অনুযায়ী isDeleted:false filter সব জায়গায় থাকা মূল সুরক্ষা)
// ==========================================================
const deleteCourierMan = async (courierManId: string) => {
  const existingCourierMan = await prisma.courierMan.findUnique({
    where: { id: courierManId },
  });

  if (!existingCourierMan) {
    throw new AppError(httpStatus.NOT_FOUND, "Courier Man Not Found");
  }

  if (existingCourierMan.isDeleted) {
    throw new AppError(httpStatus.GONE, "Courier Man Already Deleted");
  }

  const deletedCourierMan = await prisma.courierMan.update({
    where: { id: courierManId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
    include: {
      user: { omit: { password: true } },
      currentHub: true,
      zone: true,
    },
  });

  return deletedCourierMan;
};

export const CourierManServices = {
  applyAsCourierMan,
  verifyCourierManEmail,
  approveCourierMan,
  getAllCourierMans,
  getSingleCourierManById,
  updateCourierManProfile,
  toggleAvailability,
  updateLocation,
  adminUpdateCourierMan,
  deleteCourierMan,
};