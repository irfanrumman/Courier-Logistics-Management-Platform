export interface IQueryForPayment {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  status?: string;
  method?: string;
  shipmentTrackingNumber?: string;
}