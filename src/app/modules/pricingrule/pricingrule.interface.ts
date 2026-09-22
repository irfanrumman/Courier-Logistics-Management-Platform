export interface IQueryForPricingRule {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  fromZoneId?: string;
  toZoneId?: string;
}