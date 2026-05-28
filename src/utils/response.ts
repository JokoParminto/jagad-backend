interface SuccessResponse {
  success: true
  data: any
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
  }
}

export const successResponse = (
  data: any,
  message?: string,
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
): SuccessResponse => {
  return {
    success: true,
    data,
    message,
    pagination,
  }
}

export const errorResponse = (
  code: string,
  message: string,
  details?: any
): ErrorResponse => {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  }
}
