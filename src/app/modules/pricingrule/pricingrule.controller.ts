import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PricingRuleServices } from "./pricingrule.service";

const createPricingRule = catchAsync(async (req: Request, res: Response) => {
  const result = await PricingRuleServices.createPricingRule(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Pricing Rule Created Successfully",
    data: result,
  });
});

const getAllPricingRules = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PricingRuleServices.getAllPricingRules(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pricing Rules Retrieved Successfully",
    data,
    meta,
  });
});

const getSinglePricingRuleById = catchAsync(async (req: Request, res: Response) => {
  const pricingRuleId = req.params.pricingRuleId as string;
  const result = await PricingRuleServices.getSinglePricingRuleById(pricingRuleId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pricing Rule Retrieved Successfully",
    data: result,
  });
});

const updatePricingRule = catchAsync(async (req: Request, res: Response) => {
  const pricingRuleId = req.params.pricingRuleId as string;
  const result = await PricingRuleServices.updatePricingRule(pricingRuleId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pricing Rule Updated Successfully",
    data: result,
  });
});

const deletePricingRule = catchAsync(async (req: Request, res: Response) => {
  const pricingRuleId = req.params.pricingRuleId as string;
  const result = await PricingRuleServices.deletePricingRule(pricingRuleId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pricing Rule Deleted Successfully",
    data: result,
  });
});

export const PricingRuleController = {
  createPricingRule,
  getAllPricingRules,
  getSinglePricingRuleById,
  updatePricingRule,
  deletePricingRule,
};