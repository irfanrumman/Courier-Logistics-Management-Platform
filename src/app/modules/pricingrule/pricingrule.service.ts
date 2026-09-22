import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { PricingRuleWhereInput } from "../../../generated/prisma/models";
import { ICreatePricingRulePayload, IUpdatePricingRulePayload } from "./pricingrule.validation";
import { IQueryForPricingRule } from "./pricingrule.interface";

// ==========================================================
// ১. তৈরি করার আগে overlap check — একই zone-pair এর জন্য একই weight range এ
// দুইটা rule থাকলে conflict হবে (কোনটা apply হবে বোঝা যাবে না), তাই আটকে দিচ্ছি
// ==========================================================
const createPricingRule = async (payload: ICreatePricingRulePayload) => {
  const fromZone = await prisma.zone.findUnique({ where: { id: payload.fromZoneId } });
  if (!fromZone) {
    throw new AppError(httpStatus.NOT_FOUND, "From-Zone Not Found");
  }

  const toZone = await prisma.zone.findUnique({ where: { id: payload.toZoneId } });
  if (!toZone) {
    throw new AppError(httpStatus.NOT_FOUND, "To-Zone Not Found");
  }

  // একই zone pair এর existing rule গুলোর সাথে weight range overlap করছে কিনা চেক —
  // যেমন existing (0-5kg) থাকলে নতুন (3-8kg) দিলে 3-5 এর মধ্যে দুটো rule ই match করবে, যেটা bug
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

// ==========================================================
// ২. List view — zone দিয়ে filter করা যায়
// ==========================================================
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
    meta: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
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

// ==========================================================
// ৩. Update — zone না বদলে শুধু weight range/price বদলানো যায়
// এখানেও overlap check করা দরকার (নিজেকে বাদ দিয়ে), নাহলে update করেই conflict তৈরি হতে পারে
// ==========================================================
const updatePricingRule = async (pricingRuleId: string, payload: IUpdatePricingRulePayload) => {
  const existingRule = await prisma.pricingRule.findUnique({ where: { id: pricingRuleId } });

  if (!existingRule) {
    throw new AppError(httpStatus.NOT_FOUND, "Pricing Rule Not Found");
  }

  const newWeightMin = payload.weightMin ?? existingRule.weightMin.toNumber();
  const newWeightMax = payload.weightMax ?? existingRule.weightMax.toNumber();

  const overlappingRule = await prisma.pricingRule.findFirst({
    where: {
      id: { not: pricingRuleId }, // নিজেকে বাদ দিয়ে চেক করছি
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
  const existingRule = await prisma.pricingRule.findUnique({ where: { id: pricingRuleId } });

  if (!existingRule) {
    throw new AppError(httpStatus.NOT_FOUND, "Pricing Rule Not Found");
  }

  const deletedRule = await prisma.pricingRule.delete({ where: { id: pricingRuleId } });

  return deletedRule;
};

// ==========================================================
// ৪. মূল উদ্দেশ্য — shipment.service.ts এর placeholder formula replace করার জন্য
// এই ফাংশনটা shipment module থেকে import করে ব্যবহার হবে
// ==========================================================
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

  // basePrice + (perKgRate * totalWeight) — সহজ linear formula
  const totalPrice = basePrice + perKgRate * totalWeightKg;

  return Math.round(totalPrice * 100) / 100; // ২ দশমিক ঘর পর্যন্ত round করছি
};

export const PricingRuleServices = {
  createPricingRule,
  getAllPricingRules,
  getSinglePricingRuleById,
  updatePricingRule,
  deletePricingRule,
  calculatePrice,
};