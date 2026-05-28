/**
 * Generate transaction number with format: TRX-YYYYMMDD-XXX
 * Example: TRX-20240201-001
 */
export const generateTransactionNumber = (counter: number): string => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const sequence = String(counter).padStart(3, '0')

  return `TRX-${year}${month}${day}-${sequence}`
}

/**
 * Generate SKU with format: SKU-XXXXX
 * Example: SKU-00001
 */
export const generateSKU = (counter: number): string => {
  const sequence = String(counter).padStart(5, '0')
  return `SKU-${sequence}`
}

/**
 * Generate customer ID with format: CUST-XXXXX
 * Example: CUST-00001
 */
export const generateCustomerId = (counter: number): string => {
  const sequence = String(counter).padStart(5, '0')
  return `CUST-${sequence}`
}
