import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ZoneServices } from "./zone.service";

const createZone = catchAsync(async (req: Request, res: Response) => {
  const result = await ZoneServices.createZone(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Zone Created Successfully",
    data: result,
  });
});

const getAllZones = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await ZoneServices.getAllZones(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Zones Retrieved Successfully",
    data,
    meta,
  });
});

const getSingleZoneById = catchAsync(async (req: Request, res: Response) => {
  const zoneId = req.params.zoneId as string;

  const result = await ZoneServices.getSingleZoneById(zoneId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Zone Retrieved Successfully",
    data: result,
  });
});

const updateZone = catchAsync(async (req: Request, res: Response) => {
  const zoneId = req.params.zoneId as string;

  const result = await ZoneServices.updateZone(zoneId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Zone Updated Successfully",
    data: result,
  });
});

const deleteZone = catchAsync(async (req: Request, res: Response) => {
  const zoneId = req.params.zoneId as string;

  const result = await ZoneServices.deleteZone(zoneId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Zone Deleted Successfully",
    data: result,
  });
});

export const ZoneController = {
  createZone,
  getAllZones,
  getSingleZoneById,
  updateZone,
  deleteZone,
};