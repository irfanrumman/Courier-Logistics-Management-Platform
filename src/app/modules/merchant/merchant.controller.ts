import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { MerchantServices } from "./merchant.service";
import { MerchantVerificationStatus } from "../../../generated/prisma/enums";
import { IRegisterMerchantPayload } from "./merchant.validation";

const registerMerchant = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const payload = req.body as IRegisterMerchantPayload;

  const result = await MerchantServices.registerMerchant(payload, {
    tradeLicenseImage: files?.["tradeLicenseImage"],
    nidFrontImage: files?.["nidFrontImage"],
    nidBackImage: files?.["nidBackImage"],
    tinImage: files?.["tinImage"],
    shopImage: files?.["shopImage"],
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Merchant Registered Successfully. Please verify your email.",
    data: result,
  });
});

const verifyMerchantEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await MerchantServices.verifyMerchantEmail(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Email Verified Successfully",
    data: result,
  });
});

const getMyMerchantProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await MerchantServices.getMyMerchantProfile(user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Profile Retrieved Successfully",
    data: result,
  });
});

const updateMerchantProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await MerchantServices.updateMerchantProfile(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Profile Updated Successfully",
    data: result,
  });
});

const verifyMerchant = catchAsync(async (req: Request, res: Response) => {
  const reviewer = req.user!;
  const result = await MerchantServices.verifyMerchant(req.body, reviewer);

  const isVerified = result.verificationStatus === MerchantVerificationStatus.VERIFIED;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isVerified ? "Merchant has been verified" : "Merchant has been rejected",
    data: result,
  });
});

const getAllMerchants = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await MerchantServices.getAllMerchants(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchants Retrieved Successfully",
    data,
    meta,
  });
});

const getSingleMerchantById = catchAsync(async (req: Request, res: Response) => {
  const merchantId = req.params.merchantId as string;
  const result = await MerchantServices.getSingleMerchantById(merchantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Retrieved Successfully",
    data: result,
  });
});

const adminUpdateMerchantStatus = catchAsync(async (req: Request, res: Response) => {
  const merchantId = req.params.merchantId as string;
  const result = await MerchantServices.adminUpdateMerchantStatus(merchantId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Status Updated Successfully",
    data: result,
  });
});

const deleteMerchant = catchAsync(async (req: Request, res: Response) => {
  const merchantId = req.params.merchantId as string;
  const result = await MerchantServices.deleteMerchant(merchantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Merchant Deleted Successfully",
    data: result,
  });
});

export const MerchantController = {
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