import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { PricingRuleWhereInput } from "../../../generated/prisma/models";
import type {
	ICreatePricingRulePayload,
	IUpdatePricingRulePayload,
} from "./pricingrule.validation";
import type { IQueryForPricingRule } from "./pricingrule.interface";

const createPricingRule = async (payload: ICreatePricingRulePayload) => {
	const fromZone = await prisma.zone.findUnique({
		where: { id: payload.fromZoneId },
	});
	if (!fromZone) {
		throw new AppError(httpStatus.NOT_FOUND, "From-Zone Not Found");
	}

	const toZone = await prisma.zone.findUnique({
		where: { id: payload.toZoneId },
	});
	if (!toZone) {
		throw new AppError(httpStatus.NOT_FOUND, "To-Zone Not Found");
	}

	const overlappingRule = await prisma.pricingRule.findFirst({
		where: {
			fromZoneId: payload.fromZoneId,
			toZoneId: payload.toZoneId,
			weightMin: { lt: payload.weightMax },
			weightMax: { gt: payload.weightMin },
		},
	});

	if (overlappingRule) {
		throw new AppError(
			httpStatus.CONFLICT,
			`This weight range overlaps with an existing rule (${overlappingRule.weightMin}kg - ${overlappingRule.weightMax}kg) for this zone pair`,
		);
	}

	const pricingRule = await prisma.pricingRule.create({
		data: payload,
		include: { fromZone: true, toZone: true },
	});

	return pricingRule;
};

const getAllPricingRules = async (query: IQueryForPricingRule) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: PricingRuleWhereInput[] = [];

	if (query.fromZoneId) {
		andConditions.push({ fromZoneId: query.fromZoneId });
	}

	if (query.toZoneId) {
		andConditions.push({ toZoneId: query.toZoneId });
	}

	const allPricingRules = await prisma.pricingRule.findMany({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: { fromZone: true, toZone: true },
	});

	const totalCount = await prisma.pricingRule.count({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
	});

	return {
		data: allPricingRules,
		meta: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit),
		},
	};
};

const getSinglePricingRuleById = async (pricingRuleId: string) => {
	const pricingRule = await prisma.pricingRule.findUnique({
		where: { id: pricingRuleId },
		include: { fromZone: true, toZone: true },
	});

	if (!pricingRule) {
		throw new AppError(httpStatus.NOT_FOUND, "Pricing Rule Not Found");
	}

	return pricingRule;
};

const updatePricingRule = async (
	pricingRuleId: string,
	payload: IUpdatePricingRulePayload,
) => {
	const existingRule = await prisma.pricingRule.findUnique({
		where: { id: pricingRuleId },
	});

	if (!existingRule) {
		throw new AppError(httpStatus.NOT_FOUND, "Pricing Rule Not Found");
	}

	const newWeightMin = payload.weightMin ?? existingRule.weightMin.toNumber();
	const newWeightMax = payload.weightMax ?? existingRule.weightMax.toNumber();

	const overlappingRule = await prisma.pricingRule.findFirst({
		where: {
			id: { not: pricingRuleId },
			fromZoneId: existingRule.fromZoneId,
			toZoneId: existingRule.toZoneId,
			weightMin: { lt: newWeightMax },
			weightMax: { gt: newWeightMin },
		},
	});

	if (overlappingRule) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Updated weight range would overlap with an existing rule (${overlappingRule.weightMin}kg - ${overlappingRule.weightMax}kg)`,
		);
	}

	const updatedRule = await prisma.pricingRule.update({
		where: { id: pricingRuleId },
		data: payload,
		include: { fromZone: true, toZone: true },
	});

	return updatedRule;
};

const deletePricingRule = async (pricingRuleId: string) => {
	const existingRule = await prisma.pricingRule.findUnique({
		where: { id: pricingRuleId },
	});

	if (!existingRule) {
		throw new AppError(httpStatus.NOT_FOUND, "Pricing Rule Not Found");
	}

	const deletedRule = await prisma.pricingRule.delete({
		where: { id: pricingRuleId },
	});

	return deletedRule;
};

const calculatePrice = async (
	fromZoneId: string,
	toZoneId: string,
	totalWeightKg: number,
): Promise<number> => {
	const matchingRule = await prisma.pricingRule.findFirst({
		where: {
			fromZoneId,
			toZoneId,
			weightMin: { lte: totalWeightKg },
			weightMax: { gte: totalWeightKg },
		},
	});

	if (!matchingRule) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`No pricing rule found for this route and weight (${totalWeightKg}kg). Please contact support.`,
		);
	}

	const basePrice = matchingRule.basePrice.toNumber();
	const perKgRate = matchingRule.perKgRate.toNumber();

	const totalPrice = basePrice + perKgRate * totalWeightKg;

	return Math.round(totalPrice * 100) / 100;
};

export const PricingRuleServices = {
	createPricingRule,
	getAllPricingRules,
	getSinglePricingRuleById,
	updatePricingRule,
	deletePricingRule,
	calculatePrice,
};
