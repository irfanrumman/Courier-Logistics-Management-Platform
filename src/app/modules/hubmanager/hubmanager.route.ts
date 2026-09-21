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
	"/verify-email",
    validateRequest(hubManagerValidation.hubManagerEmailVerifyZodSchema),
	HubManagerController.verifyHubManagerEmail,
);

router.post(
	"/approve-hub-manager",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	HubManagerController.approveHubManager,
);

router.get(
	"/all-hub-managers",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	HubManagerController.getAllHubManagers,
);

router.patch(
	"/update-my-profile",
	auth(Role.HUB_MANAGER),
	validateRequest(hubManagerValidation.UpdateHubManagerProfileValidationZodSchema),
	HubManagerController.updateHubManagerProfile,
);


router.get(
	"/single-hub-manager/:hubManagerId",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	HubManagerController.getSingleHubManagerById,
);

router.patch(
  "/update-hub-manager/:hubManagerId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(hubManagerValidation.adminUpdateHubManagerZodSchema),
  HubManagerController.adminUpdateHubManager,
);

router.delete(
  "/delete/:hubManagerId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  HubManagerController.deleteHubManager,
);

export const HubManagerRoutes = router;

// hubManager/      → hub manager registration, profile, admin: verify/assign