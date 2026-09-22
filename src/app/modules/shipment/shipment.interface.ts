export interface IQueryForShipment {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  searchTerm?: string; 
  paymentType?: string;
  originHubId?: string;
  destinationHubId?: string;
}