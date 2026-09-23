import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { paymentValidation } from "./payment.validation";
import { PaymentController } from "./payment.controller";

const router = Router();

router.post(
  "/initiate",
  auth(Role.CUSTOMER),
  validateRequest(paymentValidation.initiatePaymentZodSchema),
  PaymentController.initiatePayment,
);

// Gateway callback/webhook — সাধারণত এটাতে auth middleware লাগে না (gateway সরাসরি call করে),
// কিন্তু bKash/SSLCommerz এর signature verification দরকার হয় (এই মুহূর্তে placeholder)
router.post(
  "/confirm",
  validateRequest(paymentValidation.confirmPaymentZodSchema),
  PaymentController.confirmPayment,
);

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
  auth(Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),
  PaymentController.getSinglePayment,
);

router.patch(
  "/refund/:paymentId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(paymentValidation.refundPaymentZodSchema),
  PaymentController.refundPayment,
);

export const PaymentRoutes = router;

// payment/         → bKash/SSLCommerz/Stripe/COD integration, payment status