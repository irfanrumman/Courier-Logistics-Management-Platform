import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { codCollectionValidation } from "./codcollection.validation";
import { CodCollectionController } from "./codcollection.controller";

const router = Router();

// Courier man নিজেই collection record করবে (delivery করার পর)
router.post(
  "/record",
  auth(Role.COURIER_MAN),
  validateRequest(codCollectionValidation.recordCollectionZodSchema),
  CodCollectionController.recordCollection,
);

router.get(
  "/my-collections",
  auth(Role.COURIER_MAN),
  CodCollectionController.getMyCollections,
);

// Admin/Hub Manager — remittance tracking
router.patch(
  "/mark-remitted/:codCollectionId",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  validateRequest(codCollectionValidation.markRemittedZodSchema),
  CodCollectionController.markRemitted,
);

router.get(
  "/all-collections",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  CodCollectionController.getAllCollections,
);

router.get(
  "/single-collection/:codCollectionId",
  auth(Role.ADMIN, Role.SUPER_ADMIN, Role.HUB_MANAGER),
  CodCollectionController.getSingleCollection,
);

export const CodCollectionRoutes = router;