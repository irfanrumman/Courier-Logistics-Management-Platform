export interface IQueryForCodCollection {
	limit?: string;
	page?: string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	isRemittedToSender?: string;
	courierManId?: string;
}
