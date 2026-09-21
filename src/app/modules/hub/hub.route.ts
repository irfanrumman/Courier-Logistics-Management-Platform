import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { hubValidation } from "./hub.validation";
import { HubController } from "./hub.controller";

const router = Router();

router.post(
  "/create-hub",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(hubValidation.createHubZodSchema),
  HubController.createHub,
);

router.get(
  "/all-hubs",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  HubController.getAllHubs,
);

router.get(
  "/single-hub/:hubId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  HubController.getSingleHubById,
);

router.patch(
  "/update-hub/:hubId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(hubValidation.updateHubZodSchema),
  HubController.updateHub,
);

router.delete(
  "/delete-hub/:hubId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  HubController.deleteHub,
);

export const HubRoutes = router;

// hub/             → hub CRUD (admin/hub manager)