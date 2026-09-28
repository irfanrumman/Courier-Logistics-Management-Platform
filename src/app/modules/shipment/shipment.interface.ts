export interface IQueryForShipment {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  searchTerm?: string; 
  isCod?: string
  status?: string;
  originHubId?: string;
  destinationHubId?: string;
}

export interface IPayShipmentPayload {
    shipmentId: string;
}