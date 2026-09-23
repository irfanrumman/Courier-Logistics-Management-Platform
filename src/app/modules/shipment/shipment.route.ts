import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { shipmentValidation } from "./shipment.validation";
import { ShipmentController } from "./shipment.controller";
import { upload } from "../../lib/multer";
import { parseFormDataJson } from "../../middleware/parseFormDataJson";

const router = Router();

// Customer/Merchant — শুধু CUSTOMER role হলেই shipment create করতে পারবে
router.post(
  "/create-shipment",
  auth(Role.CUSTOMER),
  validateRequest(shipmentValidation.createShipmentZodSchema),
  ShipmentController.createShipment,
);

router.get(
  "/my-shipments",
  auth(Role.CUSTOMER),
  ShipmentController.getMyShipments,
);

// Public — tracking number দিয়ে track করতে login লাগবে না
router.get(
  "/track/:trackingNumber",
  ShipmentController.getShipmentByTrackingNumber,
);

// Admin/Hub Manager — internal management
router.get(
  "/all-shipments",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  ShipmentController.getAllShipments,
);

router.get(
  "/single-shipment/:shipmentId",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  ShipmentController.getSingleShipmentById,
);

router.patch(
  "/update-status/:shipmentId",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  validateRequest(shipmentValidation.updateShipmentStatusZodSchema),
  ShipmentController.updateShipmentStatus,
);

router.patch(
  "/assign-courier/:shipmentId",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  validateRequest(shipmentValidation.assignCourierZodSchema),
  ShipmentController.assignCourier,
);

router.post(
  "/:shipmentId/parcels",
  auth(Role.CUSTOMER),
  validateRequest(shipmentValidation.addParcelZodSchema),
  ShipmentController.addParcel,
);

// PATCH এ file upload থাকতে পারে (parcelImage), তাই multer + parseFormDataJson লাগবে
router.patch(
  "/:shipmentId/parcels/:parcelId",
  auth(Role.CUSTOMER),
  upload.fields([{ name: "parcelImage", maxCount: 1 }]),
  parseFormDataJson,
  validateRequest(shipmentValidation.updateParcelZodSchema),
  ShipmentController.updateParcel,
);

router.delete(
  "/:shipmentId/parcels/:parcelId",
  auth(Role.CUSTOMER),
  ShipmentController.deleteParcel,
);



export const ShipmentRoutes = router;

// shipment/        → shipment create/track/status-update, parcel add (core module, nested parcel routes)