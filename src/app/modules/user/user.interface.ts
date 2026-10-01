export interface IQueryForUser {
	limit?: string;
	page?: string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	searchTerm?: string; // name/email
	role?: string;
	status?: string;
}
