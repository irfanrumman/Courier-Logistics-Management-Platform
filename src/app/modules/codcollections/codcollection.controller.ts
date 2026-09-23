import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { CodCollectionServices } from "./codcollection.service";

const recordCollection = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await CodCollectionServices.recordCollection(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "COD Collection Recorded Successfully",
    data: result,
  });
});

const markRemitted = catchAsync(async (req: Request, res: Response) => {
  const codCollectionId = req.params.codCollectionId as string;
  const result = await CodCollectionServices.markRemitted(codCollectionId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Marked As Remitted Successfully",
    data: result,
  });
});

const getAllCollections = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await CodCollectionServices.getAllCollections(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "COD Collections Retrieved Successfully",
    data,
    meta,
  });
});

const getSingleCollection = catchAsync(async (req: Request, res: Response) => {
  const codCollectionId = req.params.codCollectionId as string;
  const result = await CodCollectionServices.getSingleCollection(codCollectionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "COD Collection Retrieved Successfully",
    data: result,
  });
});

const getMyCollections = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, meta } = await CodCollectionServices.getMyCollections(req.query, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your COD Collections Retrieved Successfully",
    data,
    meta,
  });
});

export const CodCollectionController = {
  recordCollection,
  markRemitted,
  getAllCollections,
  getSingleCollection,
  getMyCollections,
};