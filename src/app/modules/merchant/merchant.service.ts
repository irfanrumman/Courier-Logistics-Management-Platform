import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { Role, MerchantVerificationStatus } from "../../../generated/prisma/enums";
import { MerchantProfileWhereInput } from "../../../generated/prisma/models";
import {
  IRegisterMerchantPayload,
  IMerchantEmailVerifyPayload,
  IUpdateMerchantProfilePayload,
  IVerifyMerchantPayload,
  IAdminUpdateMerchantStatusPayload,
} from "./merchant.validation";
import { IQueryForMerchant } from "./merchant.interface";


const registerMerchant = async (
  payload: IRegisterMerchantPayload,
  files: {
    tradeLicenseImage?: Express.Multer.File[];
    nidFrontImage?: Express.Multer.File[];
    nidBackImage?: Express.Multer.File[];
    tinImage?: Express.Multer.File[];
    shopImage?: Express.Multer.File[];
  },
) => {
  const isUserExists = await prisma.user.findUnique({
    where: { email: payload.user.email },
  });

  if (isUserExists) {
    throw new AppError(httpStatus.CONFLICT, "User already exists with this email");
  }

  // Unique fields — আগেভাগে ভালো error message দেওয়ার জন্য
  const [existingLicense, existingNid, existingTin] = await Promise.all([
    prisma.merchantProfile.findUnique({
      where: { tradeLicenseNumber: payload.merchantProfile.tradeLicenseNumber },
    }),
    prisma.merchantProfile.findUnique({
      where: { nidNumber: payload.merchantProfile.nidNumber },
    }),
    prisma.merchantProfile.findUnique({
      where: { tinNumber: payload.merchantProfile.tinNumber },
    }),
  ]);

  if (existingLicense) {
    throw new AppError(httpStatus.CONFLICT, "This trade license number is already registered");
  }
  if (existingNid) {
    throw new AppError(httpStatus.CONFLICT, "This NID number is already registered");
  }
  if (existingTin) {
    throw new AppError(httpStatus.CONFLICT, "This TIN number is already registered");
  }

  const tradeLicenseFile = files.tradeLicenseImage?.[0];
  const nidFrontFile = files.nidFrontImage?.[0];
  const nidBackFile = files.nidBackImage?.[0];
  const tinFile = files.tinImage?.[0];
  const shopFile = files.shopImage?.[0];

  if (!tradeLicenseFile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Trade license image is required");
  }
  if (!nidFrontFile) {
    throw new AppError(httpStatus.BAD_REQUEST, "NID front image is required");
  }
  if (!nidBackFile) {
    throw new AppError(httpStatus.BAD_REQUEST, "NID back image is required");
  }
  if (!tinFile) {
    throw new AppError(httpStatus.BAD_REQUEST, "TIN image is required");
  }

  // Trade License upload — hub manager এর resume upload এর মতো ইনলাইন Promise
  const tradeLicenseUploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
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
      .end(tradeLicenseFile.buffer);
  });

  // NID Front upload
  const nidFrontUploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
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
      .end(nidFrontFile.buffer);
  });

  // NID Back upload
  const nidBackUploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
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
      .end(nidBackFile.buffer);
  });

  // TIN upload
  const tinUploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
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
      .end(tinFile.buffer);
  });

  // Shop image upload — ঐচ্ছিক, তাই file থাকলে তবেই upload করছি
  let shopUploadResult: UploadApiResponse | null = null;
  if (shopFile) {
    shopUploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "auto" },
          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result returned from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(shopFile.buffer);
    });
  }

  const hashedPassword = await bcrypt.hash(payload.user.password, Number(config.bcrypt_salt_rounds));

  const merchant = await prisma.user.create({
    data: {
      name: payload.user.name,
      email: payload.user.email,
      password: hashedPassword,
      phone: payload.user.phone,
      gender: payload.user.gender,
      role: Role.MERCHANT,
      merchantProfile: {
        create: {
          businessName: payload.merchantProfile.businessName,
          ownerName: payload.merchantProfile.ownerName,
          pickupAddressLine: payload.merchantProfile.pickupAddressLine,
          pickupDistrict: payload.merchantProfile.pickupDistrict,
          pickupThana: payload.merchantProfile.pickupThana,
          pickupPostalCode: payload.merchantProfile.pickupPostalCode,
          tradeLicenseNumber: payload.merchantProfile.tradeLicenseNumber,
          nidNumber: payload.merchantProfile.nidNumber,
          tinNumber: payload.merchantProfile.tinNumber,

          tradeLicenseImageUrl: tradeLicenseUploadResult.secure_url,
          tradeLicenseImagePublicId: tradeLicenseUploadResult.public_id,
          nidFrontImageUrl: nidFrontUploadResult.secure_url,
          nidFrontImagePublicId: nidFrontUploadResult.public_id,
          nidBackImageUrl: nidBackUploadResult.secure_url,
          nidBackImagePublicId: nidBackUploadResult.public_id,
          tinImageUrl: tinUploadResult.secure_url,
          tinImagePublicId: tinUploadResult.public_id,
          shopImageUrl: shopUploadResult?.secure_url,
          shopImagePublicId: shopUploadResult?.public_id,
        },
      },
    },
    include: { merchantProfile: true },
    omit: { password: true },
  });

  // Email verification OTP
  const expirationSeconds = 60 * 60;
  const otpKey = `merchant-registration-otp:${payload.user.email}`;
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
    subject: "Merchant Registration - Email Verification",
    html,
  });

  return merchant;
};


const verifyMerchantEmail = async (payload: IMerchantEmailVerifyPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { merchantProfile: true },
  });

  if (!existingUser || !existingUser.merchantProfile) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Account Not Found");
  }

  if (existingUser.emailVerified) {
    throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
  }

  const otpKey = `merchant-registration-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP Expired. Please request a new one.");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifiedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { merchantProfile: true },
  });

  return verifiedUser;
};


const getMyMerchantProfile = async (user: RequestUser) => {
  const merchantProfile = await prisma.merchantProfile.findUnique({
    where: { userId: user.userId },
    include: { user: { omit: { password: true } } },
  });

  if (!merchantProfile) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Profile Not Found");
  }

  return merchantProfile;
};


const updateMerchantProfile = async (payload: IUpdateMerchantProfilePayload, user: RequestUser) => {
  const existingMerchant = await prisma.merchantProfile.findUnique({
    where: { userId: user.userId },
  });

  if (!existingMerchant) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Profile Not Found");
  }

  if (existingMerchant.isDeleted) {
    throw new AppError(httpStatus.GONE, "Merchant Profile Has Been Deleted");
  }

  const result = await prisma.$transaction(async (tx) => {
    let updatedUser = null;
    let updatedMerchantProfile = null;

    if (payload.user) {
      const { name, phone, gender } = payload.user;
      updatedUser = await tx.user.update({
        where: { id: user.userId },
        data: { name, phone, gender },
        omit: { password: true },
      });
    }

    if (payload.merchantProfile) {
      const { businessName, ownerName, PickupAddressLine, PickupDistrict, PickupThana, PickupPostalCode } =
        payload.merchantProfile;

      updatedMerchantProfile = await tx.merchantProfile.update({
        where: { userId: user.userId },
        data: { businessName, ownerName, PickupAddressLine, PickupDistrict, PickupThana, PickupPostalCode },
      });
    }

    return { user: updatedUser, merchantProfile: updatedMerchantProfile };
  });

  return result;
};


const verifyMerchant = async (payload: IVerifyMerchantPayload, reviewer: RequestUser) => {
  const { merchantId, verificationStatus, rejectionReason, codLimit } = payload;

  const existingMerchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
    include: { user: true },
  });

  if (!existingMerchant) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Not Found");
  }

  if (existingMerchant.isDeleted) {
    throw new AppError(httpStatus.GONE, "Merchant Has Been Deleted");
  }

  if (existingMerchant.verificationStatus !== MerchantVerificationStatus.UNVERIFIED) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Merchant Has Already Been ${existingMerchant.verificationStatus.toLowerCase()}`,
    );
  }

  const isVerified = verificationStatus === MerchantVerificationStatus.VERIFIED;

  const updatedMerchant = await prisma.merchantProfile.update({
    where: { id: merchantId },
    data: {
      verificationStatus,
      rejectionReason: isVerified ? null : rejectionReason,
      codLimit: isVerified && codLimit ? codLimit : undefined,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    },
    include: { user: { omit: { password: true } } },
  });

  const templatePath = path.join(
    process.cwd(),
    `src/app/templates/${isVerified ? "application-approved.ejs" : "application-rejected.ejs"}`,
  );

  const html = await ejs.renderFile(templatePath, {
    name: updatedMerchant.user.name,
    reason: updatedMerchant.rejectionReason,
    roleName: "Merchant",
    extraNote: isVerified
      ? `Your COD limit has been updated to ${updatedMerchant.codLimit}.`
      : undefined,
  });

  await transporter.sendMail({
    from: { name: "Courier & Logistics Management", address: config.email_sender },
    to: updatedMerchant.user.email,
    subject: isVerified
      ? "Your Merchant Account Has Been Verified"
      : "Your Merchant Verification Was Rejected",
    html,
  });

  return updatedMerchant;
};


const getAllMerchants = async (query: IQueryForMerchant) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: MerchantProfileWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { businessName: { contains: query.searchTerm, mode: "insensitive" } },
        { ownerName: { contains: query.searchTerm, mode: "insensitive" } },
        { user: { email: { contains: query.searchTerm, mode: "insensitive" } } },
      ],
    });
  }

  if (query.email) {
    andConditions.push({ user: { email: { contains: query.email, mode: "insensitive" } } });
  }

  if (query.tradeLicenseNumber) {
    andConditions.push({
      tradeLicenseNumber: { equals: query.tradeLicenseNumber, mode: "insensitive" },
    });
  }

  if (query.verificationStatus) {
    andConditions.push({ verificationStatus: query.verificationStatus as MerchantVerificationStatus });
  }

  if (query.status) {
    andConditions.push({ status: query.status as any });
  }

  andConditions.push({ isDeleted: false });

  const allMerchants = await prisma.merchantProfile.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: { user: { omit: { password: true } } },
  });

  const totalMerchantCount = await prisma.merchantProfile.count({ where: { AND: andConditions } });

  return {
    data: allMerchants,
    meta: {
      page,
      limit,
      total: totalMerchantCount,
      totalPages: Math.ceil(totalMerchantCount / limit),
    },
  };
};

const getSingleMerchantById = async (merchantId: string) => {
  const merchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
    include: { user: { omit: { password: true } } },
  });

  if (!merchant) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Not Found");
  }

  if (merchant.isDeleted) {
    throw new AppError(httpStatus.GONE, "Merchant Has Been Deleted");
  }

  return merchant;
};


const adminUpdateMerchantStatus = async (
  merchantId: string,
  payload: IAdminUpdateMerchantStatusPayload,
) => {
  const existingMerchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
  });

  if (!existingMerchant) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Not Found");
  }

  if (existingMerchant.isDeleted) {
    throw new AppError(httpStatus.GONE, "Merchant Has Been Deleted");
  }

  const updatedMerchant = await prisma.merchantProfile.update({
    where: { id: merchantId },
    data: { status: payload.status },
    include: { user: { omit: { password: true } } },
  });

  return updatedMerchant;
};


const deleteMerchant = async (merchantId: string) => {
  const existingMerchant = await prisma.merchantProfile.findUnique({
    where: { id: merchantId },
  });

  if (!existingMerchant) {
    throw new AppError(httpStatus.NOT_FOUND, "Merchant Not Found");
  }

  if (existingMerchant.isDeleted) {
    throw new AppError(httpStatus.GONE, "Merchant Already Deleted");
  }

  const deletedMerchant = await prisma.merchantProfile.update({
    where: { id: merchantId },
    data: { isDeleted: true, deletedAt: new Date() },
    include: { user: { omit: { password: true } } },
  });

  return deletedMerchant;
};

export const MerchantServices = {
  registerMerchant,
  verifyMerchantEmail,
  getMyMerchantProfile,
  updateMerchantProfile,
  verifyMerchant,
  getAllMerchants,
  getSingleMerchantById,
  adminUpdateMerchantStatus,
  deleteMerchant,
};