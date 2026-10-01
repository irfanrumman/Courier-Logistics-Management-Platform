import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { CustomerController } from "./customer.controller";
import { customerValidation } from "./customer.validation";
import {auth} from "../../middleware/checkAuth"
import { validateRequest } from "../../middleware/validateRequest";

const router = Router();


router.post(
  "/register",
  validateRequest(customerValidation.registerCustomerZodSchema),
  CustomerController.registerCustomer,
);

router.post(
  "/verify-email",
  validateRequest(customerValidation.customerEmailVerifyZodSchema),
  CustomerController.verifyCustomerEmail,
);


// router.get(
//   "/my-profile",
//   auth(Role.CUSTOMER),
//   CustomerController.getMyCustomerProfile,
// );

router.patch(
  "/update-my-profile",
  auth(Role.CUSTOMER),
  validateRequest(customerValidation.updateCustomerProfileZodSchema),
  CustomerController.updateMyCustomerProfile,
);

router.get(
  "/all-customers",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CustomerController.getAllCustomers,
);

router.get(
  "/single-customer/:customerId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CustomerController.getSingleCustomerById,
);

router.patch(
  "/update-customer/:customerId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(customerValidation.adminUpdateCustomerZodSchema),
  CustomerController.adminUpdateCustomerStatus,
);

router.delete(
  "/delete/:customerId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  CustomerController.adminDeleteCustomer,
);

export const CustomerRoutes = router;

