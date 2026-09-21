import { prisma } from "../lib/prisma";

export const generateEmployeeId = async (hubId: string | null): Promise<string> => {
  const year = new Date().getFullYear();

  let hubCode = "GEN"; 

  if (hubId) {
    const hub = await prisma.hub.findUnique({
      where: { id: hubId },
      select: { code: true },
    });

    if (hub) {
      hubCode = hub.code;
    }
  }


  const totalCount = await prisma.hubManager.count({
    where: {
         employeeId: { 
            not: null 
        } 
    },
  });

  const nextNumber = (totalCount + 1).toString().padStart(4, "0");
  return `${hubCode}-HM-${year}-${nextNumber}`;
};