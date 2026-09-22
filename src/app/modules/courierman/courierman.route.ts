import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { courierManValidation } from "./courierman.validation";
import { CourierManController } from "./courierman.controller";

const router = Router();

// Public — কেউ registration করতে পারবে, resume/file upload নেই তাই parseFormDataJson/upload.fields লাগছে না
router.post(
  "/apply-as-courier-man",
  validateRequest(courierManValidation.applyAsCourierManZodSchema),
  CourierManController.applyAsCourierMan,
);

router.post(
  "/verify-email",
  validateRequest(courierManValidation.courierManEmailVerifyZodSchema),
  CourierManController.verifyCourierManEmail,
);

// Admin-only
router.post(
  "/approve-courier-man",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(courierManValidation.approveCourierManZodSchema),
  CourierManController.approveCourierMan,
);

router.get(
  "/all-courier-mans",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CourierManController.getAllCourierMans,
);

router.get(
  "/single-courier-man/:courierManId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CourierManController.getSingleCourierManById,
);

router.patch(
  "/admin-update/:courierManId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(courierManValidation.adminUpdateCourierManZodSchema),
  CourierManController.adminUpdateCourierMan,
);

router.delete(
  "/delete/:courierManId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CourierManController.deleteCourierMan,
);

// Courier man নিজের জন্য (self-service)
router.patch(
  "/update-my-profile",
  auth(Role.COURIER_MAN),
  validateRequest(courierManValidation.updateCourierManProfileZodSchema),
  CourierManController.updateCourierManProfile,
);

router.patch(
  "/toggle-availability",
  auth(Role.COURIER_MAN),
  validateRequest(courierManValidation.toggleAvailabilityZodSchema),
  CourierManController.toggleAvailability,
);

router.patch(
  "/update-location",
  auth(Role.COURIER_MAN),
  validateRequest(courierManValidation.updateLocationZodSchema),
  CourierManController.updateLocation,
);

export const CourierManRoutes = router;

// courierMan/      → courier registration, profile, availability toggle, admin: verify/assign