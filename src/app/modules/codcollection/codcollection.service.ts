import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { RequestUser } from "../../middleware/checkAuth";
import type { CodCollectionWhereInput } from "../../../generated/prisma/models";
import type {
	IRecordCollectionPayload,
	IMarkRemittedPayload,
	IConfirmHubReceiptPayload,
} from "./codcollection.validation";
import type { IQueryForCodCollection } from "./codcollection.interface";
import { Role, ShipmentStatus } from "../../../generated/prisma/enums";

const recordCollection = async (
	payload: IRecordCollectionPayload,
	user: RequestUser,
) => {
	const shipment = await prisma.shipment.findUnique({
		where: { id: payload.shipmentId },
		include: { codCollection: true },
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	
	if (!shipment.codAmount) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Shipment Is Not Cash-On-Delivery",
		);
	}

	const courierMan = await prisma.courierMan.findUnique({
		where: { userId: user.userId },
	});

	if (!courierMan) {
		throw new AppError(httpStatus.FORBIDDEN, "Courier Man Profile Not Found");
	}

	
	if (shipment.lastMileCourierManId !== courierMan.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Assigned As The Last-Mile Courier For This Shipment",
		);
	}

	
	if (shipment.status !== ShipmentStatus.OUT_FOR_DELIVERY) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"COD can only be collected while the shipment is out for delivery",
		);
	}

	if (shipment.codCollection) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Collection Has Already Been Recorded For This Shipment",
		);
	}

	const collection = await prisma.codCollection.create({
		data: {
			shipmentId: payload.shipmentId,
			amountCollected: payload.amountCollected,
			collectedAt: new Date(),
			collectedByCourierManId: courierMan.id,
		},
	});

	return collection;
};

const confirmHubReceipt = async (
	payload: IConfirmHubReceiptPayload,
	user: RequestUser,
) => {
	const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

	
	let hubManager: { id: string; hubId: string | null; isDeleted: boolean } | null =
		null;

	if (!isAdmin) {
		hubManager = await prisma.hubManager.findUnique({
			where: { userId: user.userId },
		});

		if (!hubManager || hubManager.isDeleted || !hubManager.hubId) {
			throw new AppError(httpStatus.FORBIDDEN, "Hub Manager Profile Not Found");
		}
	}

	const shipment = await prisma.shipment.findUnique({
		where: { id: payload.shipmentId },
		include: { codCollection: true },
	});

	if (!shipment) {
		throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
	}

	
	if (hubManager && shipment.destinationHubId !== hubManager.hubId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only the destination hub manager can confirm this cash",
		);
	}

	if (!shipment.codAmount) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Shipment Is Not Cash-On-Delivery",
		);
	}

	if (!shipment.codCollection) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"The courier has not recorded any collected cash for this shipment yet",
		);
	}

	if (shipment.codCollection.submittedToHubAt) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This Collection Has Already Been Confirmed By A Hub",
		);
	}

	return prisma.codCollection.update({
		where: { id: shipment.codCollection.id },
		data: {
			submittedToHubAt: new Date(),
			
			receivedByHubManagerId: hubManager ? hubManager.id : null,
		},
		include: {
			shipment: { select: { id: true, trackingNumber: true } },
			collectedByCourierMan: {
				include: { user: { select: { id: true, name: true } } },
			},
		},
	});
};

const markRemitted = async (
	codCollectionId: string,
	payload: IMarkRemittedPayload,
) => {
	const existingCollection = await prisma.codCollection.findUnique({
		where: { id: codCollectionId },
	});

	if (!existingCollection) {
		throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
	}

	if (!existingCollection.submittedToHubAt) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This amount has not been submitted to and confirmed by the hub yet",
		);
	}

	if (existingCollection.isRemittedToSender) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This Collection Has Already Been Remitted",
		);
	}

	if (payload.remittedAmount > existingCollection.amountCollected.toNumber()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Remitted amount cannot exceed the collected amount",
		);
	}

	const updatedCollection = await prisma.codCollection.update({
		where: { id: codCollectionId },
		data: {
			isRemittedToSender: true,
			remittedAmount: payload.remittedAmount,
			remittedAt: new Date(),
		},
	});

	return updatedCollection;
};

const getAllCollections = async (query: IQueryForCodCollection) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: CodCollectionWhereInput[] = [];

	if (query.isRemittedToSender !== undefined) {
		andConditions.push({
			isRemittedToSender: query.isRemittedToSender === "true",
		});
	}

	if (query.courierManId) {
		andConditions.push({ collectedByCourierManId: query.courierManId });
	}

	const collections = await prisma.codCollection.findMany({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			shipment: {
				select: {
					id: true,
					trackingNumber: true,
					codAmount: true,
					sender: { select: { id: true, name: true, email: true } },
				},
			},
			collectedByCourierMan: {
				include: { user: { select: { id: true, name: true, email: true } } },
			},
		},
	});

	const total = await prisma.codCollection.count({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
	});

	return {
		data: collections,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getSingleCollection = async (codCollectionId: string) => {
	const collection = await prisma.codCollection.findUnique({
		where: { id: codCollectionId },
		include: {
			shipment: {
				include: { sender: { select: { id: true, name: true, email: true } } },
			},
			collectedByCourierMan: {
				include: { user: { select: { id: true, name: true } } },
			},
		},
	});

	if (!collection) {
		throw new AppError(httpStatus.NOT_FOUND, "COD Collection Record Not Found");
	}

	return collection;
};

const getMyCollections = async (
	query: IQueryForCodCollection,
	user: RequestUser,
) => {
	const courierMan = await prisma.courierMan.findUnique({
		where: { userId: user.userId },
	});

	if (!courierMan) {
		throw new AppError(httpStatus.NOT_FOUND, "Courier Man Profile Not Found");
	}

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const collections = await prisma.codCollection.findMany({
		where: { collectedByCourierManId: courierMan.id },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			shipment: {
				select: { id: true, trackingNumber: true, receiverName: true },
			},
		},
	});

	const total = await prisma.codCollection.count({
		where: { collectedByCourierManId: courierMan.id },
	});

	return {
		data: collections,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getMySenderCODCollections = async (
	query: IQueryForCodCollection,
	user: RequestUser,
) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: CodCollectionWhereInput[] = [
		{ shipment: { senderId: user.userId } },
	];

	if (query.isRemittedToSender !== undefined) {
		andConditions.push({
			isRemittedToSender: query.isRemittedToSender === "true",
		});
	}

	const collections = await prisma.codCollection.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			shipment: { select: { id: true, trackingNumber: true, codAmount: true } },
		},
	});

	const total = await prisma.codCollection.count({
		where: { AND: andConditions },
	});

	return {
		data: collections,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

export const CodCollectionServices = {
	recordCollection,
	confirmHubReceipt,
	markRemitted,
	getAllCollections,
	getSingleCollection,
	getMyCollections,
	getMySenderCODCollections,
};
