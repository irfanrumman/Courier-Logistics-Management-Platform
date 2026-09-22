import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { pricingRuleValidation } from "./pricingrule.validation";
import { PricingRuleController } from "./pricingrule.controller";

const router = Router();

router.post(
  "/create-pricing-rule",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(pricingRuleValidation.createPricingRuleZodSchema),
  PricingRuleController.createPricingRule,
);

router.get(
  "/all-pricing-rules",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  PricingRuleController.getAllPricingRules,
);

router.get(
  "/single-pricing-rule/:pricingRuleId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  PricingRuleController.getSinglePricingRuleById,
);

router.patch(
  "/update-pricing-rule/:pricingRuleId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(pricingRuleValidation.updatePricingRuleZodSchema),
  PricingRuleController.updatePricingRule,
);

router.delete(
  "/delete-pricing-rule/:pricingRuleId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  PricingRuleController.deletePricingRule,
);

export const PricingRuleRoutes = router;

// pricingRule/     → pricing rule CRUD + price calculation logic