import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { IQuery } from "../../interfaces";
import { HubWhereInput } from "../../../generated/prisma/models";
import { ICreateHubPayload, IUpdateHubPayload } from "./hub.validation";

const createHub = async (payload: ICreateHubPayload) => {
  const existingHub = await prisma.hub.findUnique({
    where: { code: payload.code },
  });

  if (existingHub) {
    throw new AppError(httpStatus.CONFLICT, "A hub with this code already exists");
  }

  const zone = await prisma.zone.findUnique({
    where: { id: payload.zoneId },
  });

  if (!zone) {
    throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
  }

  const hub = await prisma.hub.create({
    data: payload,
    include: { zone: true },
  });

  return hub;
};

const getAllHubs = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: HubWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { code: { contains: query.searchTerm, mode: "insensitive" } },
        { address: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.zoneId) {
    andConditions.push({ zoneId: query.zoneId });
  }

  const allHubs = await prisma.hub.findMany({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },

    take: limit,
    skip,

    orderBy: {
      [sortBy]: sortOrder,
    },

    include: {
      zone: true,
    },
  });

  const totalHubCount = await prisma.hub.count({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },
  });

  return {
    data: allHubs,
    meta: {
      page,
      limit,
      total: totalHubCount,
      totalPages: Math.ceil(totalHubCount / limit),
    },
  };
};

const getSingleHubById = async (hubId: string) => {
  const hub = await prisma.hub.findUnique({
    where: { id: hubId },
    include: {
      zone: true,
      hubManagers: {
        where: { isDeleted: false },
        include: { user: { omit: { password: true } } },
      },
    },
  });

  if (!hub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  return hub;
};

const updateHub = async (hubId: string, payload: IUpdateHubPayload) => {
  const existingHub = await prisma.hub.findUnique({
    where: { id: hubId },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  if (payload.code) {
    const hubWithSameCode = await prisma.hub.findUnique({
      where: { code: payload.code },
    });

    if (hubWithSameCode && hubWithSameCode.id !== hubId) {
      throw new AppError(httpStatus.CONFLICT, "A hub with this code already exists");
    }
  }

  if (payload.zoneId) {
    const zone = await prisma.zone.findUnique({
      where: { id: payload.zoneId },
    });

    if (!zone) {
      throw new AppError(httpStatus.NOT_FOUND, "Zone Not Found");
    }
  }

  const updatedHub = await prisma.hub.update({
    where: { id: hubId },
    data: payload,
    include: { zone: true },
  });

  return updatedHub;
};

const deleteHub = async (hubId: string) => {
  const existingHub = await prisma.hub.findUnique({
    where: { id: hubId },
    include: {
      hubManagers: { where: { isDeleted: false } },
      courierMans: true,
    },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  if (existingHub.hubManagers.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot delete hub — it still has active hub manager(s) assigned. Reassign or remove them first.",
    );
  }

  if (existingHub.courierMans.length > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot delete hub — it still has courier man(s) assigned. Reassign them first.",
    );
  }

  const deletedHub = await prisma.hub.delete({
    where: { id: hubId },
  });

  return deletedHub;
};

export const HubServices = {
  createHub,
  getAllHubs,
  getSingleHubById,
  updateHub,
  deleteHub,
};