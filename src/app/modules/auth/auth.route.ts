import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	validateRequest(UserValidation.customerRegistrationZodSchema),
	AuthController.registerCustomer,
);
router.post(
	"/verify-email",
	validateRequest(UserValidation.customerEmailVerifyZodSchema),
	AuthController.verifyCustomerEmail,
);
// router.post(
// 	"/login",
// 	validateRequest(UserValidation.LoginZodSchema),
// 	AuthController.loginUser,
// );
// router.get(
// 	"/me",
// 	auth(Role.ADMIN, Role.CUSTOMER, Role.COURIER_MAN, Role.HUB_MANAGER, Role.SUPER_ADMIN),
// 	// validateRequest
// 	AuthController.getMe,
// );
// router.post("/refresh-token", AuthController.refreshToken);
// router.post("/google", AuthController.googleLogin);
// router.post(
// 	"/forgot-password",
// 	validateRequest(UserValidation.ForgotPasswordZodSchema),
// 	AuthController.forgotPassword,
// );
// router.post(
// 	"/reset-password",
// 	validateRequest(UserValidation.ResetPasswordZodSchema),
// 	AuthController.resetPassword,
// );
export const AuthRoutes = router;