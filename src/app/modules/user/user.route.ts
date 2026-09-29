import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { UserController } from "./user.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { userValidation } from "./user.validation";



const router = Router();



router.patch(
	"/profile-image",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.COURIER_MAN, Role.CUSTOMER, Role.MERCHANT, Role.HUB_MANAGER),
	upload.single("profileImage"),
	UserController.uploadProfileImage,
);

router.get(
  "/all-users",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  UserController.getAllUsers,
);

router.get(
  "/single-user/:userId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  UserController.getSingleUserById,
);

router.patch(
  "/status/:userId",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(userValidation.updateUserStatusZodSchema),
  UserController.updateUserStatus,
);

// router.delete(
//   "/:userId",
//   auth(Role.ADMIN, Role.SUPER_ADMIN, Role.COURIER_MAN, Role.HUB_MANAGER, Role.MERCHANT, Role.CUSTOMER),
//   UserController.deleteUser,
// );


export const UserRoutes = router;


//  user/            → getMe,