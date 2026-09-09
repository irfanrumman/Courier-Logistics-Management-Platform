import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { HubManagerServices } from "./hubmanager.service";
// import { DoctorServices } from "./doctor.service";
// import {
// 	ApplyAsDoctorValidationZodSchema,
// } from "./doctor.validation";

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

	const result = await DoctorServices.verifyDoctorEmail(payload)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified Successfully",
		data: result,
	});
});
// const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	
// 	const payload = req.body;
// 	const user = req.user!

// 	const result = await DoctorServices.approveDoctor(payload, user)
// 	sendResponse(res, {
// 		statusCode: httpStatus.OK,
// 		success: true,
// 		message: "Doctor Email Verified Successfully",
// 		data: result,
// 	});
// });
// const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	

// 	const {data, meta} = await DoctorServices.getAllDoctors(req.query)
// 	sendResponse(res, {
// 		statusCode: httpStatus.OK,
// 		success: true,
// 		message: "Doctors Retrieved Successfully",
// 		data: data,
// 		meta : meta,
// 	});
// });
// const updateDoctorProfile = catchAsync(
// 	async (req: Request, res: Response) => {
// 		const payload = req.body;
// 		const user = req.user!;

// 		const result = await DoctorServices.updateDoctorProfile(payload, user);
// 		sendResponse(res, {
// 			statusCode: httpStatus.OK,
// 			success: true,
// 			message: "Doctor Profile Updated Successfully",
// 			data: result,
// 		});
// 	},
// );



// const getAvailableDoctorByTodaysSchedule = catchAsync(
// 	async (req: Request, res: Response) => {
	

// 		const { data, meta } = await DoctorServices.getAvailableDoctorByTodaysSchedule(
// 			req.query
// 		);
// 		sendResponse(res, {
// 			statusCode: httpStatus.OK,
// 			success: true,
// 			message: "Today's Available Doctors Retrieved Successfully",
// 			data,
// 			meta,
// 		});
// 	},
// );

// const getAllDoctorsListPublic = catchAsync(async (req: Request, res: Response) => {


// 	const { data, meta } = await DoctorServices.getAllDoctorsListPublic(
// 		req.query
// 	);
// 	sendResponse(res, {
// 		statusCode: httpStatus.OK,
// 		success: true,
// 		message: "Doctors Retrieved Successfully",
// 		data,
// 		meta,
// 	});
// });

// const getSingleDoctorPublicProfile = catchAsync(
// 	async (req: Request, res: Response) => {

// 		const doctorId = req.params.doctorId as string
		
// 		const result = await DoctorServices.getSingleDoctorPublicProfile(
// 			doctorId
// 		);
// 		sendResponse(res, {
// 			statusCode: httpStatus.OK,
// 			success: true,
// 			message: "Doctor Profile Retrieved Successfully",
// 			data: result,
// 		});
// 	},
// );

export const HubManagerController = {
	applyAsHubManager,
	verifyHubManagerEmail,
	// approveDoctor,
	// getAllDoctors,
	// updateDoctorProfile,
	// getAvailableDoctorByTodaysSchedule,
	// getAllDoctorsListPublic,
	// getSingleDoctorPublicProfile,
};