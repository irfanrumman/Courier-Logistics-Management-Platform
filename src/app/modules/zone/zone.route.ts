import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { zoneValidation } from "./zone.validation";
import { ZoneController } from "./zone.controller";

const router = Router();

router.post(
  "/create-zone",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(zoneValidation.createZoneZodSchema),
  ZoneController.createZone,
);

router.get(
  "/all-zones",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  ZoneController.getAllZones,
);

router.get(
  "/single-zone/:zoneId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  ZoneController.getSingleZoneById,
);

router.patch(
  "/update-zone/:zoneId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(zoneValidation.updateZoneZodSchema),
  ZoneController.updateZone,
);

router.delete(
  "/delete-zone/:zoneId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  ZoneController.deleteZone,
);

export const ZoneRoutes = router;

// zone/            → zone CRUD (admin only)