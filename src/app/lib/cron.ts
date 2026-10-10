// import cron from "node-cron";
// import { prisma } from "./prisma";
// import {
// 	HubManagerVerificationStatus,
// 	Role,
// } from "../../generated/prisma/enums";
// import { cloudinary } from "./cloudinary";

// export const deleteUnverifiedHubManagers = async () => {
// 	cron.schedule("*/10 * * * *", async () => {
// 		try {
// 			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

// 			const expiredHubManagers = await prisma.user.findMany({
// 				where: {
// 					role: Role.HUB_MANAGER,
// 					emailVerified: false,
// 					createdAt: { lt: oneHourAgo },
// 					hubManager: {
// 						verificationStatus: HubManagerVerificationStatus.PENDING,
// 					},
// 				},
// 				select: {
// 					id: true,
// 					hubManager: {
// 						select: {
// 							resumePublicId: true,
// 							additionalFiles: true, // Json field: [{ url, publicId }, ...]
// 						},
// 					},
// 				},
// 			});

// 			if (expiredHubManagers.length === 0) {
// 				console.log(
// 					"Unverified Hub Manager Delete cron schedule (every 10 minutes)",
// 				);
// 				return;
// 			}

// 			for (const user of expiredHubManagers) {
// 				const publicIdsToDelete: string[] = [];

// 				if (user.hubManager?.resumePublicId) {
// 					publicIdsToDelete.push(user.hubManager.resumePublicId);
// 				}

// 				if (Array.isArray(user.hubManager?.additionalFiles)) {
// 					const files = user.hubManager.additionalFiles as {
// 						url: string;
// 						publicId: string;
// 					}[];
// 					files.forEach((file) => {
// 						if (file.publicId) publicIdsToDelete.push(file.publicId);
// 					});
// 				}

// 				if (publicIdsToDelete.length > 0) {
// 					try {
// 						await cloudinary.api.delete_resources(publicIdsToDelete);
// 					} catch (cloudinaryError) {
// 						console.log(
// 							`Cron: Failed to delete Cloudinary files for user ${user.id}`,
// 							cloudinaryError,
// 						);
// 					}
// 				}
// 			}

// 			const userIds = expiredHubManagers.map((u) => u.id);
// 			const deletedHubManagers = await prisma.user.deleteMany({
// 				where: {
// 					id: { in: userIds },
// 					role: Role.HUB_MANAGER,
// 					emailVerified: false,
// 					hubManager: {
// 						verificationStatus: HubManagerVerificationStatus.PENDING,
// 					},
// 				},
// 			});

// 			if (deletedHubManagers.count > 0) {
// 				console.log(
// 					`Cron: Deleted ${deletedHubManagers.count} unverified Hub Manager applications older than 1 hour (Cloudinary files cleaned up)`,
// 				);
// 			}
// 		} catch (error) {
// 			console.log(
// 				"Cron: Failed to delete unverified Hub Manager applications",
// 				error,
// 			);
// 		}
// 	});
// };


// 

import cron from "node-cron";
import { prisma } from "./prisma";
import { cloudinary } from "./cloudinary";
import {
	CourierManVerificationStatus,
	HubManagerVerificationStatus,
	MerchantVerificationStatus,
	Role,
} from "../../generated/prisma/enums";
import type { UserSelect, UserWhereInput } from "../../generated/prisma/models";


type ICleanupUser = { id: string } & Record<string, any>;

type ICleanupConfig = {
	label: string; 
	role: Role;
	profileWhere: UserWhereInput; 
	profileSelect: UserSelect; 
	getPublicIds: (user: ICleanupUser) => string[]; 
};


const getResumeAndAdditionalFilesPublicIds = (profile: any): string[] => {
	const publicIds: string[] = [];

	if (profile?.resumePublicId) {
		publicIds.push(profile.resumePublicId);
	}

	if (Array.isArray(profile?.additionalFiles)) {
		(profile.additionalFiles as { url: string; publicId: string }[]).forEach(
			(file) => {
				if (file.publicId) publicIds.push(file.publicId);
			},
		);
	}

	return publicIds;
};

const cleanupConfigs: ICleanupConfig[] = [
	{
		label: "Hub Manager",
		role: Role.HUB_MANAGER,
		profileWhere: {
			hubManager: { verificationStatus: HubManagerVerificationStatus.PENDING },
		},
		profileSelect: {
			hubManager: { select: { resumePublicId: true, additionalFiles: true } },
		},
		getPublicIds: (user) => getResumeAndAdditionalFilesPublicIds(user.hubManager),
	},
	{
		label: "Courier Man",
		role: Role.COURIER_MAN,
		profileWhere: {
			courierMan: { verificationStatus: CourierManVerificationStatus.PENDING },
		},
		profileSelect: {
			courierMan: { select: { resumePublicId: true, additionalFiles: true } },
		},
		
		getPublicIds: (user) => getResumeAndAdditionalFilesPublicIds(user.courierMan),
	},
	{
		label: "Merchant",
		role: Role.MERCHANT,
		profileWhere: {
			merchantProfile: {
				verificationStatus: MerchantVerificationStatus.UNVERIFIED,
			},
		
		},
		profileSelect: {
			merchantProfile: {
				select: {
					tradeLicenseImagePublicId: true,
					nidFrontImagePublicId: true,
					nidBackImagePublicId: true,
					tinImagePublicId: true,
					shopImagePublicId: true,
				},
			},
		},
		getPublicIds: (user) => {
			const profile = user.merchantProfile;

			return [
				profile?.tradeLicenseImagePublicId,
				profile?.nidFrontImagePublicId,
				profile?.nidBackImagePublicId,
				profile?.tinImagePublicId,
				profile?.shopImagePublicId, 
			].filter((id): id is string => !!id);
		},
	},
];

const cleanupUnverifiedUsers = async (config: ICleanupConfig) => {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

	
	const safetyWhere: UserWhereInput = {
		role: config.role,
		emailVerified: false,
		...config.profileWhere,
	};

	const expiredUsers = (await prisma.user.findMany({
		where: { ...safetyWhere, createdAt: { lt: oneHourAgo } },
		select: { id: true, ...config.profileSelect },
	})) as unknown as ICleanupUser[];


	console.log(`Cron [${config.label}]: ${expiredUsers.length} expired user found`);

	if (expiredUsers.length === 0) {
		return;
	}

	const userIds = expiredUsers.map((user) => user.id);

	const deleteResult = await prisma.user.deleteMany({
		where: { ...safetyWhere, id: { in: userIds } },
	});

	console.log(`Cron [${config.label}]: ${deleteResult.count} user deleted from DB`);

	const survivors = await prisma.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true },
	});

	const survivorIds = new Set(survivors.map((user) => user.id));
	const deletedUsers = expiredUsers.filter((user) => !survivorIds.has(user.id));

	const publicIdsToDelete = deletedUsers.flatMap((user) =>
		config.getPublicIds(user),
	);

	if (publicIdsToDelete.length > 0) {
		
		for (const resourceType of ["image", "raw"] as const) {
			try {
				await cloudinary.api.delete_resources(publicIdsToDelete, {
					resource_type: resourceType,
				});
			} catch (cloudinaryError) {
				console.log(
					`Cron: Failed to delete ${resourceType} Cloudinary files for unverified ${config.label}`,
					cloudinaryError,
				);
			}
		}
	}
};

export const deleteUnverifiedUsers = async () => {
	console.log("Cron registered: unverified user cleanup (every 10 minutes)");

	cron.schedule("*/10 * * * *", async () => {
		// প্রতিটা role আলাদা try/catch-এ, একটার error হলে বাকিগুলো থেমে যাবে না
		for (const config of cleanupConfigs) {
			try {
				await cleanupUnverifiedUsers(config);
			} catch (error) {
				console.log(
					`Cron: Failed to clean up unverified ${config.label} applications`,
					error,
				);
			}
		}
	});
};
