import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { PaymentController } from "./payment.controller";

const router = Router();

router.get(
	"/my-payments",
	auth(Role.CUSTOMER),
	PaymentController.getMyPayments,
);

router.get(
	"/all-payments",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	PaymentController.getAllPayments,
);

router.get(
	"/single-payment/:paymentId",
	auth(
		Role.CUSTOMER,
		Role.MERCHANT,
		Role.HUB_MANAGER,
		Role.ADMIN,
		Role.SUPER_ADMIN,
	),
	PaymentController.getSinglePayment,
);

export const PaymentRoutes = router;
