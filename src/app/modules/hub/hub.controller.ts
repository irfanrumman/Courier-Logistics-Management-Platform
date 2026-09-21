import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { HubServices } from "./hub.service";

const createHub = catchAsync(async (req: Request, res: Response) => {
  const result = await HubServices.createHub(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Hub Created Successfully",
    data: result,
  });
});

const getAllHubs = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await HubServices.getAllHubs(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hubs Retrieved Successfully",
    data,
    meta,
  });
});

const getSingleHubById = catchAsync(async (req: Request, res: Response) => {
  const hubId = req.params.hubId as string;

  const result = await HubServices.getSingleHubById(hubId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Retrieved Successfully",
    data: result,
  });
});

const updateHub = catchAsync(async (req: Request, res: Response) => {
  const hubId = req.params.hubId as string;

  const result = await HubServices.updateHub(hubId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Updated Successfully",
    data: result,
  });
});

const deleteHub = catchAsync(async (req: Request, res: Response) => {
  const hubId = req.params.hubId as string;

  const result = await HubServices.deleteHub(hubId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Deleted Successfully",
    data: result,
  });
});

export const HubController = {
  createHub,
  getAllHubs,
  getSingleHubById,
  updateHub,
  deleteHub,
};