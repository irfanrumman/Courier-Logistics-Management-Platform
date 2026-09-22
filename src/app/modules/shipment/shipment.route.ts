import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { shipmentValidation } from "./shipment.validation";
import { ShipmentController } from "./shipment.controller";

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

// logic lagbe lekha

router.post("/:shipmentId/parcels", ...);              // নতুন parcel যোগ
router.patch("/:shipmentId/parcels/:parcelId", ...);    // parcel আপডেট (image upload সহ)
router.delete("/:shipmentId/parcels/:parcelId", ...);   // parcel মুছে ফেলা



export const ShipmentRoutes = router;

// shipment/        → shipment create/track/status-update, parcel add (core module, nested parcel routes)