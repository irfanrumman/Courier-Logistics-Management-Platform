import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { HubManagerServices } from "./hubmanager.service";
import { HubManagerVerificationStatus } from "../../../generated/prisma/enums";



const applyAsHubManager = catchAsync(async (req: Request, res: Response) => {

	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	console.log({ files });
	const resume = files?.["resume"] ? files["resume"][0] : null;
	const additionalFiles = files?.["additionalFiles"] || [];


	const payload = req.body;

	const result = await HubManagerServices.applyAsHubManager(
		payload,
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Applied As Hub Manager Successfuly",
		data: result,
	});
});


const verifyHubManagerEmail = catchAsync(async (req: Request, res: Response) => {
	
	const payload = req.body;

	const result = await HubManagerServices.verifyHubManagerEmail(payload);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Hub Manager Email Verified Successfully",
		data: result,
	});
});

const approveHubManager = catchAsync(async (req: Request, res: Response) => {
	
	const payload = req.body;
	const user = req.user!

	const result = await HubManagerServices.approveHubManager(payload, user);
	 const isApproved = result.verificationStatus === HubManagerVerificationStatus.APPROVED;

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: isApproved
      ? "Hub Manager application has been approved"
      : "Hub Manager application has been rejected",
		data: result,
	});
});

const getAllHubManagers = catchAsync(async (req: Request, res: Response) => {
	

	const {data, meta} = await HubManagerServices.getAllHubManagers(req.query)

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Hub Managers Retrieved Successfully",
		data: data,
		meta : meta,
	});
});

const updateHubManagerProfile = catchAsync(
	async (req: Request, res: Response) => {
		const payload = req.body;
		const user = req.user!;

		const result = await HubManagerServices.updateHubManagerProfile(payload, user);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Hub Manager Profile Updated Successfully",
			data: result,
		});
	},
);


const getSingleHubManagerById = catchAsync(
	async (req: Request, res: Response) => {

		const hubManagerId = req.params.hubManagerId as string

		const result = await HubManagerServices.getSingleHubManagerById(
			hubManagerId
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Hub Manager Retrieved Successfully",
			data: result,
		});
	},
);

const adminUpdateHubManager = catchAsync(async (req: Request, res: Response) => {
  const hubManagerId = req.params.hubManagerId as string;
  const payload = req.body;

  const result = await HubManagerServices.adminUpdateHubManager(hubManagerId, payload);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Manager Updated Successfully",
    data: result,
  });
});


const deleteHubManager = catchAsync(async (req: Request, res: Response) => {
  const hubManagerId = req.params.hubManagerId as string;

  const result = await HubManagerServices.deleteHubManager(hubManagerId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Manager Deleted Successfully",
    data: result,
  });
});

export const HubManagerController = {
	applyAsHubManager,
	verifyHubManagerEmail,
	approveHubManager,
	getAllHubManagers,
	updateHubManagerProfile,
	getSingleHubManagerById,
	adminUpdateHubManager,
	deleteHubManager
};