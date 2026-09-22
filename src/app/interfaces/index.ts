
export interface IQuery {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: string;
  searchTerm?: string;
  
  email?: string;
  employeeId?: string;
  hubCode?: string;   
  hubName?: string;     
  verificationStatus?: string;

  //any other filter fields can be added here
  [key: string] : any
};



export interface IQueryForCourier {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  searchTerm?: string;
  email?: string;
  courierType?: string;
  currentStatus?: string;
  isAvailable?: string;
  verificationStatus?: string;
  hubCode?: string;
}