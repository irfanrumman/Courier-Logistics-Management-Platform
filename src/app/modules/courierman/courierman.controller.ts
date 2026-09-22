import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { CourierManServices } from "./courierman.service";
import { CourierManVerificationStatus } from "../../../generated/prisma/enums";

const applyAsCourierMan = catchAsync(async (req: Request, res: Response) => {
  const result = await CourierManServices.applyAsCourierMan(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Applied As Courier Man Successfully",
    data: result,
  });
});

const verifyCourierManEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await CourierManServices.verifyCourierManEmail(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Man Email Verified Successfully",
    data: result,
  });
});

const approveCourierMan = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await CourierManServices.approveCourierMan(req.body, user);

  const isApproved = result.verificationStatus === CourierManVerificationStatus.APPROVED;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: isApproved
      ? "Courier Man application has been approved"
      : "Courier Man application has been rejected",
    data: result,
  });
});

const getAllCourierMans = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await CourierManServices.getAllCourierMans(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Men Retrieved Successfully",
    data,
    meta,
  });
});

const getSingleCourierManById = catchAsync(async (req: Request, res: Response) => {
  const courierManId = req.params.courierManId as string;
  const result = await CourierManServices.getSingleCourierManById(courierManId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Man Retrieved Successfully",
    data: result,
  });
});

const updateCourierManProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await CourierManServices.updateCourierManProfile(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Man Profile Updated Successfully",
    data: result,
  });
});

const toggleAvailability = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await CourierManServices.toggleAvailability(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `You are now marked as ${result.isAvailable ? "available" : "unavailable"}`,
    data: result,
  });
});

const updateLocation = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await CourierManServices.updateLocation(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location Updated Successfully",
    data: result,
  });
});

const adminUpdateCourierMan = catchAsync(async (req: Request, res: Response) => {
  const courierManId = req.params.courierManId as string;
  const result = await CourierManServices.adminUpdateCourierMan(courierManId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Man Updated Successfully",
    data: result,
  });
});

const deleteCourierMan = catchAsync(async (req: Request, res: Response) => {
  const courierManId = req.params.courierManId as string;
  const result = await CourierManServices.deleteCourierMan(courierManId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Man Deleted Successfully",
    data: result,
  });
});

export const CourierManController = {
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