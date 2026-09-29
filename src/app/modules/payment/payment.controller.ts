import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentServices } from "./payment.service";

const initiatePayment = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await PaymentServices.initiatePayment(req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Payment Initiated Successfully",
    data: result,
  });
});

const confirmPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentServices.confirmPayment(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment Confirmed Successfully",
    data: result,
  });
});

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const { data, meta } = await PaymentServices.getMyPayments(req.query, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your Payments Retrieved Successfully",
    data,
    meta,
  });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PaymentServices.getAllPayments(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payments Retrieved Successfully",
    data,
    meta,
  });
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
  const paymentId = req.params.paymentId as string;
  const user = req.user!;
  const result = await PaymentServices.getSinglePayment(paymentId, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment Retrieved Successfully",
    data: result,
  });
});

const refundPayment = catchAsync(async (req: Request, res: Response) => {
  const paymentId = req.params.paymentId as string;
  const result = await PaymentServices.refundPayment(paymentId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment Refunded Successfully",
    data: result,
  });
});

export const PaymentController = {
  initiatePayment,
  confirmPayment,
  getMyPayments,
  getAllPayments,
  getSinglePayment,
  refundPayment,
};