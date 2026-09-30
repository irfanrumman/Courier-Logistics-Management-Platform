export interface IQueryForCodCollection {
  limit?: string;
  page?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  isRemittedToSender?: string; // "true"/"false" — কোনগুলো এখনো merchant কে পাঠানো হয়নি সেটা filter করতে
  courierManId?: string;
}