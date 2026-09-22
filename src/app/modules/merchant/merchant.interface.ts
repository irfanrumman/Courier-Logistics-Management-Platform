export interface IQueryForMerchant {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  searchTerm?: string;
  email?: string;
  tradeLicenseNumber?: string;
  verificationStatus?: string;
  status?: string;
}