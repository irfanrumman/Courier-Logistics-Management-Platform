import cron from 'node-cron';
import { prisma } from './prisma';
import { HubManagerVerificationStatus, Role } from '../../generated/prisma/enums';
import { cloudinary } from './cloudinary';


export const deleteUnverifiedHubManagers = async () => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const expiredHubManagers = await prisma.user.findMany({
        where: {
          role: Role.HUB_MANAGER,
          emailVerified: false,
          createdAt: { lt: oneHourAgo },
          hubManager: {
            verificationStatus: HubManagerVerificationStatus.PENDING,
          },
        },
        select: {
          id: true,
          hubManager: {
            select: {
              resumePublicId: true,
              additionalFiles: true, // Json field: [{ url, publicId }, ...]
            },
          },
        },
      });

      if (expiredHubManagers.length === 0) {
        console.log("Unverified Hub Manager Delete cron schedule (every 10 minutes)");
        return;
      }

      // ধাপ ২: Cloudinary থেকে প্রতিটার resume + additionalFiles delete করো
      for (const user of expiredHubManagers) {
        const publicIdsToDelete: string[] = [];

        if (user.hubManager?.resumePublicId) {
          publicIdsToDelete.push(user.hubManager.resumePublicId);
        }

        if (Array.isArray(user.hubManager?.additionalFiles)) {
          const files = user.hubManager.additionalFiles as { url: string; publicId: string }[];
          files.forEach((file) => {
            if (file.publicId) publicIdsToDelete.push(file.publicId);
          });
        }

        if (publicIdsToDelete.length > 0) {
          try {
            await cloudinary.api.delete_resources(publicIdsToDelete);
          } catch (cloudinaryError) {
          
            console.log(`Cron: Failed to delete Cloudinary files for user ${user.id}`, cloudinaryError);
          }
        }
      }

      
      const userIds = expiredHubManagers.map((u) => u.id);
      const deletedHubManagers = await prisma.user.deleteMany({
        where: {
          id: { in: userIds },
          role: Role.HUB_MANAGER,
          emailVerified: false,
          hubManager: {
            verificationStatus: HubManagerVerificationStatus.PENDING,
          },
        },
      });

      if (deletedHubManagers.count > 0) {
        console.log(
          `Cron: Deleted ${deletedHubManagers.count} unverified Hub Manager applications older than 1 hour (Cloudinary files cleaned up)`,
        );
      }
    } catch (error) {
      console.log("Cron: Failed to delete unverified Hub Manager applications", error);
    }
  });
};