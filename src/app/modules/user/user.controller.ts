import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
	if (!req.file) {
		throw new AppError(httpStatus.BAD_REQUEST, "No File Provided.");
	}

	const userId = req.user?.userId;

	const result = await UserServices.uploadProfileImage(
		req.file?.buffer,
		userId!,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile image uploaded successfully",
		data: result,
	});
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await UserServices.getAllUsers(req.query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Users Retrieved Successfully",
		data,
		meta,
	});
});

const getSingleUserById = catchAsync(async (req: Request, res: Response) => {
	const userId = req.params.userId as string;
	const result = await UserServices.getSingleUserById(userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User Retrieved Successfully",
		data: result,
	});
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
	const userId = req.params.userId as string;
	const reviewer = req.user!;
	const result = await UserServices.updateUserStatus(
		userId,
		req.body,
		reviewer,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `User ${result.status === "SUSPENDED" ? "Banned" : "Unbanned"} Successfully`,
		data: result,
	});
});

export const UserController = {
	uploadProfileImage,
	getAllUsers,
	getSingleUserById,
	updateUserStatus,
};
