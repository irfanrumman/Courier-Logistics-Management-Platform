
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
}