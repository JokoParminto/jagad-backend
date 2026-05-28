export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginationResult {
  page: number
  limit: number
  total: number
  totalPages: number
  offset: number
}

export const getPagination = (
  page: number = 1,
  limit: number = 10,
  total: number
): PaginationResult => {
  const validPage = Math.max(1, page)
  const validLimit = Math.min(Math.max(1, limit), 100)
  const totalPages = Math.ceil(total / validLimit)
  const offset = (validPage - 1) * validLimit

  return {
    page: validPage,
    limit: validLimit,
    total,
    totalPages,
    offset,
  }
}

export const extractPaginationParams = (query: any): PaginationParams => {
  return {
    page: parseInt(query.page) || 1,
    limit: parseInt(query.limit) || 10,
  }
}
