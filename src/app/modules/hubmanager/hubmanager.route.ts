import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
// import { validateRequest } from "../../middleware/valideRequest";

// import { UpdateDoctorProfileValidationZodSchema } from "./doctor.validation";
import { hubManagerValidation } from "./hubmanager.validation";
import { HubManagerController } from "./hubmanager.controller";
import { parseFormDataJson } from "../../middleware/parseFormDataJson";


const router = Router();



router.post(
	"/apply-as-hub-manager",
    upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},

		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
    parseFormDataJson(),
	validateRequest(hubManagerValidation.applyAsHubManagerZodSchema),
	
	HubManagerController.applyAsHubManager,
);

router.post(
	"/apply-as-doctor/verify-email",
    validateRequest(hubManagerValidation.hubManagerEmailVerifyZodSchema),
	HubManagerController.verifyHubManagerEmail,
);
// router.post(
// 	"/approve-doctor",
// 	auth(Role.ADMIN, Role.SUPER_ADMIN),
// 	DoctorController.approveDoctor,
// );
// router.get(
// 	"/all-doctors",
// 	auth(Role.ADMIN, Role.SUPER_ADMIN),
// 	DoctorController.getAllDoctors,
// );

// router.patch(
// 	"/update-my-profile",
// 	auth(Role.DOCTOR),
// 	validateRequest(UpdateDoctorProfileValidationZodSchema),
// 	DoctorController.updateDoctorProfile,
// );

// // Public doctor-discovery routes (no auth) — meant for patients browsing before login.
// router.get(
// 	"/public/available-today",
// 	DoctorController.getAvailableDoctorByTodaysSchedule,
// );

// router.get(
// 	"/public/all-doctors",
// 	DoctorController.getAllDoctorsListPublic,
// );

// router.get(
// 	"/public/:doctorId",
// 	DoctorController.getSingleDoctorPublicProfile,
// );

export const HubManagerRoutes = router;

// hubManager/      → hub manager registration, profile, admin: verify/assign