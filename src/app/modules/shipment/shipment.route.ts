import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { shipmentValidation } from "./shipment.validation";
import { ShipmentController } from "./shipment.controller";
import { upload } from "../../lib/multer";
import { parseFormDataJson } from "../../middleware/parseFormDataJson";

const router = Router();


router.post(
  "/create-shipment",
  auth(Role.CUSTOMER, Role.MERCHANT),
  validateRequest(shipmentValidation.createShipmentZodSchema),
  ShipmentController.createShipment,
);

router.post(
  "/pay-shipment",
  auth(Role.CUSTOMER, Role.MERCHANT),
  validateRequest(shipmentValidation.payShipmentSchema),
  ShipmentController.payShipment,
);


router.get(
  "/create-shipment/payment/callback",
  ShipmentController.shipmentPaymentCallback,
);

router.get(
  "/my-shipments",
  auth(Role.CUSTOMER, Role.MERCHANT),
  ShipmentController.getMyShipments,
);

router.patch(
  "/cancel/:shipmentId",
  auth(Role.CUSTOMER, Role.MERCHANT),
  ShipmentController.cancelShipment,
);


router.get(
  "/track/:trackingNumber",
  ShipmentController.getShipmentByTrackingNumber,
);


router.get(
  "/single-shipment/:shipmentId",
  auth(Role.CUSTOMER, Role.MERCHANT, Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  ShipmentController.getSingleShipmentById,
);

// Admin/Hub Manager — internal management
router.get(
  "/all-shipments",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  ShipmentController.getAllShipments,
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
  ShipmentController.assignCourierMan,
);

router.post(
  "/:shipmentId/parcels",
  auth(Role.CUSTOMER, Role.MERCHANT),
  validateRequest(shipmentValidation.addParcelZodSchema),
  ShipmentController.addParcel,
);

router.patch(
  "/:shipmentId/parcels/:parcelId",
  auth(Role.CUSTOMER, Role.MERCHANT),
  upload.fields([{ name: "parcelImage", maxCount: 1 }]),
  parseFormDataJson,
  validateRequest(shipmentValidation.updateParcelZodSchema),
  ShipmentController.updateParcel,
);

router.delete(
  "/:shipmentId/parcels/:parcelId",
  auth(Role.CUSTOMER, Role.MERCHANT),
  ShipmentController.deleteParcel,
);

export const ShipmentRoutes = router;