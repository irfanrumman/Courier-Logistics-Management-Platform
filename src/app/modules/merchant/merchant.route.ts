import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { parseFormDataJson } from "../../middleware/parseFormDataJson";
import { merchantValidation } from "./merchant.validation";
import { MerchantController } from "./merchant.controller";

const router = Router();


router.post(
  "/register",
  upload.fields([
    { name: "tradeLicenseImage", maxCount: 1 },
    { name: "nidFrontImage", maxCount: 1 },
    { name: "nidBackImage", maxCount: 1 },
    { name: "tinImage", maxCount: 1 },
    { name: "shopImage", maxCount: 1 },
  ]),
  parseFormDataJson(),
  validateRequest(merchantValidation.registerMerchantZodSchema),
  MerchantController.registerMerchant,
);

router.post(
  "/verify-email",
  validateRequest(merchantValidation.merchantEmailVerifyZodSchema),
  MerchantController.verifyMerchantEmail,
);

router.get("/my-profile", 
  auth(Role.MERCHANT), 
  MerchantController.getMyMerchantProfile);

router.patch(
  "/update-my-profile",
  auth(Role.MERCHANT),
  validateRequest(merchantValidation.updateMerchantProfileZodSchema),
  MerchantController.updateMerchantProfile,
);

router.patch(
  "/verify-merchant",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(merchantValidation.verifyMerchantZodSchema),
  MerchantController.verifyMerchant,
);

router.get("/all-merchants", auth(Role.ADMIN, Role.SUPER_ADMIN), MerchantController.getAllMerchants);

router.get(
  "/single-merchant/:merchantId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  MerchantController.getSingleMerchantById,
);

router.patch(
  "/admin-update-status/:merchantId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(merchantValidation.adminUpdateMerchantStatusZodSchema),
  MerchantController.adminUpdateMerchantStatus,
);

router.delete(
  "/delete/:merchantId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  MerchantController.deleteMerchant,
);

export const MerchantRoutes = router;

// merchant/        → merchant registration, profile, admin: verify/reject/list merchants