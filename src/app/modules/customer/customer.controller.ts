import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { CustomerService } from "./customer.service";


const registerCustomer = catchAsync(
  async (req: Request, res: Response) => {
    const result = await CustomerService.registerCustomer(req.body);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Customer registered successfully",
      data: result,
    });
  },
);

const verifyCustomerEmail = catchAsync(
  async (req: Request, res: Response) => {

    const result = await CustomerService.verifyCustomerEmail(req.body);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Email verified successfully",
      data: result,
    });
  },
);

const getMyCustomerProfile = catchAsync(
  async (req: Request, res: Response) => {

    const user = req.user!
    const result = await CustomerService.getMyCustomerProfile(user);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customer profile retrieved successfully",
      data: result,
    });
  },
);

const updateMyCustomerProfile = catchAsync(
  async (req: Request, res: Response) => {

    const user = req.user!;
    const result = await CustomerService.updateMyCustomerProfile(
      user,
      req.body,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customer profile updated successfully",
      data: result,
    });
  },
);

const getAllCustomers = catchAsync(
  async (req: Request, res: Response) => {
    const result = await CustomerService.getAllCustomers(req.query);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customers retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  },
);

const getSingleCustomerById = catchAsync(
  async (req: Request, res: Response) => {

    const customerId = req.params.customerId as string;
    const result = await CustomerService.getSingleCustomerById(
      customerId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customer retrieved successfully",
      data: result,
    });
  },
);

const adminUpdateCustomerStatus = catchAsync(
  async (req: Request, res: Response) => {

    const customerId = req.params.customerId as string;
    const result = await CustomerService.adminUpdateCustomerStatus(
      customerId,
      req.body.status,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customer status updated successfully",
      data: result,
    });
  },
);

const adminDeleteCustomer = catchAsync(
  async (req: Request, res: Response) => {

    const customerId = req.params.customerId as string;
    const result = await CustomerService.adminDeleteCustomer(
      customerId,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Customer deleted successfully",
      data: result,
    });
  },
);

export const CustomerController = {
  registerCustomer,
  verifyCustomerEmail,
  getMyCustomerProfile,
  updateMyCustomerProfile,
  getAllCustomers,
  getSingleCustomerById,
  adminUpdateCustomerStatus,
  adminDeleteCustomer,
};