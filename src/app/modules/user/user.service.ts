import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { RequestUser } from "../../middleware/checkAuth";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import { UserWhereInput } from "../../../generated/prisma/models";
import { IUpdateUserStatusPayload } from "./user.validation";
import { IQueryForUser } from "./user.interface";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {

	const currentUser = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			imagePublicId: true,
			imageUrl: true,
		},
	});

	const cloudinaryResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{
						resource_type: "auto",
					},

					async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(new Error("No result returned from Cloudinary"));
						}

						resolve(result);
					},
				)
				.end(buffer);
		},
	);

	const updatedUser = await prisma.user.update({
		where: {
			id: userId,
		},

		data: {
			imageUrl: cloudinaryResult.secure_url,
			imagePublicId: cloudinaryResult.public_id,
		},

		omit: {
			password: true,
		},
	});

	if (currentUser?.imagePublicId && currentUser.imageUrl) {
		await cloudinary.uploader.destroy(currentUser.imagePublicId);
	}

	return updatedUser;
};

// ==========================================================
// ১. Admin এর জন্য সব user এর তালিকা — role/status/searchTerm দিয়ে filter করা যাবে,
// এখানে role-agnostic ভাবে সব role এর user (customer, merchant, courier, hub manager, admin) দেখা যাবে
// ==========================================================
const getAllUsers = async (query: IQueryForUser) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: UserWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { email: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.role) {
    andConditions.push({ role: query.role as Role });
  }

  if (query.status) {
    andConditions.push({ status: query.status as UserStatus });
  }

  const users = await prisma.user.findMany({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    omit: { password: true },
  });

  const total = await prisma.user.count({
    where: { AND: andConditions.length > 0 ? andConditions : undefined },
  });

  return {
    data: users,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ==========================================================
// ২. Admin এর জন্য single user — তার role অনুযায়ী যে profile থাকে (customer/merchant/
// courierMan/hubManager) সবগুলোই include করছি, যেটা exist করে সেটাই non-null আসবে
// ==========================================================
const getSingleUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    omit: { password: true },
    include: {
      customer: true,
      merchantProfile: true,
      courierMan: true,
      hubManager: true,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  return user;
};

// ==========================================================
// ৩. Ban/Unban — শুধু ACTIVE <-> SUSPENDED এর মধ্যে টগল।
// দুইটা সুরক্ষা: (ক) কেউ নিজেকে ব্যান করতে পারবে না,
// (খ) সাধারণ ADMIN অন্য ADMIN/SUPER_ADMIN কে ব্যান করতে পারবে না — শুধু SUPER_ADMIN পারবে
// ==========================================================
const updateUserStatus = async (
  userId: string,
  payload: IUpdateUserStatusPayload,
  reviewer: RequestUser,
) => {
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  if (existingUser.id === reviewer.userId) {
    throw new AppError(httpStatus.BAD_REQUEST, "You Cannot Change Your Own Status");
  }

  if (existingUser.status === "DELETED") {
    throw new AppError(httpStatus.GONE, "This User Has Been Deleted");
  }

  const targetIsPrivileged =
    existingUser.role === Role.ADMIN || existingUser.role === Role.SUPER_ADMIN;

  if (targetIsPrivileged && reviewer.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only a Super Admin can change the status of an Admin",
    );
  }

  if (existingUser.status === payload.status) {
    throw new AppError(httpStatus.CONFLICT, `User Is Already ${payload.status}`);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status: payload.status },
    omit: { password: true },
  });

  return updatedUser;
};


export const UserServices = {
	uploadProfileImage,
	 getAllUsers,
  getSingleUserById,
  updateUserStatus,
};