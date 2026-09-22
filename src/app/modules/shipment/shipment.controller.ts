import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ShipmentServices } from "./shipment.service";

const createShipment = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await ShipmentServices.createShipment(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Shipment Created Successfully",
    data: result,
  });
});

const getMyShipments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, meta } = await ShipmentServices.getMyShipments(user, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your Shipments Retrieved Successfully",
    data,
    meta,
  });
});

const getShipmentByTrackingNumber = catchAsync(async (req: Request, res: Response) => {
  const trackingNumber = req.params.trackingNumber as string;
  const result = await ShipmentServices.getShipmentByTrackingNumber(trackingNumber);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shipment Retrieved Successfully",
    data: result,
  });
});

const getSingleShipmentById = catchAsync(async (req: Request, res: Response) => {
  const shipmentId = req.params.shipmentId as string;
  const result = await ShipmentServices.getSingleShipmentById(shipmentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shipment Retrieved Successfully",
    data: result,
  });
});

const getAllShipments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await ShipmentServices.getAllShipments(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shipments Retrieved Successfully",
    data,
    meta,
  });
});

const updateShipmentStatus = catchAsync(async (req: Request, res: Response) => {
  const shipmentId = req.params.shipmentId as string;
  const user = req.user!;
  const result = await ShipmentServices.updateShipmentStatus(shipmentId, req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shipment Status Updated Successfully",
    data: result,
  });
});

const assignCourier = catchAsync(async (req: Request, res: Response) => {
  const shipmentId = req.params.shipmentId as string;
  const user = req.user!;
  const result = await ShipmentServices.assignCourier(shipmentId, req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courier Assigned Successfully",
    data: result,
  });
});

export const ShipmentController = {
  createShipment,
  getMyShipments,
  getShipmentByTrackingNumber,
  getSingleShipmentById,
  getAllShipments,
  updateShipmentStatus,
  assignCourier,
};