import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { IQuery } from "../../interfaces";
import { ZoneWhereInput } from "../../../generated/prisma/models";
import { ICreateZonePayload, IUpdateZonePayload } from "./zone.validation";

const createZone = async (payload: ICreateZonePayload) => {
  const zone = await prisma.zone.create({
    data: payload,
  });

  return zone;
};

const getAllZones = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ZoneWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { region: { contains: query.searchTerm, mode: "insensitive" } },
        { adress: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.region) {
    andConditions.push({
      region: { equals: query.region, mode: "insensitive" },
    });
  }

  const allZones = await prisma.zone.findMany({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },

    take: limit,
    skip,

    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  const totalZoneCount = await prisma.zone.count({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },
  });

  return {
    data: allZones,
    meta: {
      page,
      limit,
      total: totalZoneCount,
      totalPages: Math.ceil(totalZoneCount / limit),
    },
  };
};

const getSingleZoneById = async (zoneId: string) => {
  const zone = await prisma.zone.findUnique({
    where: { id: zoneId },
    include: {
      hubs: true,
    },
  });

  if (!zone) {
    throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
  }

  return zone;
};

const updateZone = async (zoneId: string, payload: IUpdateZonePayload) => {
  const existingZone = await prisma.zone.findUnique({
    where: { id: zoneId },
  });

  if (!existingZone) {
    throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
  }

  const updatedZone = await prisma.zone.update({
    where: { id: zoneId },
    data: payload,
  });

  return updatedZone;
};

const deleteZone = async (zoneId: string) => {
  const existingZone = await prisma.zone.findUnique({
    where: { id: zoneId },
    include: {
      hubs: true,
      courierMans: true,
    },
  });

  if (!existingZone) {
    throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
  }

  if (existingZone.hubs.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot delete zone — it still has hub(s) assigned. Reassign or remove them first.",
    );
  }

  if (existingZone.courierMans.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot delete zone — it still has courier man(s) assigned. Reassign them first.",
    );
  }

  const deletedZone = await prisma.zone.delete({
    where: { id: zoneId },
  });

  return deletedZone;
};

export const ZoneServices = {
  createZone,
  getAllZones,
  getSingleZoneById,
  updateZone,
  deleteZone,
};