import cron from 'node-cron';
// import { DoctorVerificationStatus, Role } from '../../generated/prisma/enums';
import { prisma } from './prisma';
import { HubManagerVerificationStatus, Role } from '../../generated/prisma/enums';


export const deleteUnverifiedHubManagers = async () => {
    cron.schedule('*/10 * * * *', async () => {

       try {
           const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
           const deletedHubManagers = await prisma.user.deleteMany({
               where: {
                   role: Role.HUB_MANAGER,
                   emailVerified: false,
                   createdAt: { lt: oneHourAgo },
                   hubManager: {
                       verificationStatus: HubManagerVerificationStatus.PENDING
                   }
               }
           });


           if (deletedHubManagers.count > 0) {
               console.log(`
                Cron: Deleted ${deletedHubManagers.count} unverified email Hub Manager applications older than 1 hour
                `);
           }
       } catch (error) {

            console.log("Cron: Failed to delete unverified Hub Manager applications", error);
       }

       console.log("Unverified Hub Manager Delete cron schedule (every 10 minutes)");
    });
}