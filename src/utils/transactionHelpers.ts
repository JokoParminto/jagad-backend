/**
 * Transaction Helper Functions
 * Utilities for member pricing, promo calculations, and transaction processing
 */

import { Pool } from "pg";

/**
 * Calculate member pricing for an item
 * Returns the price to use and member savings amount
 */
export interface MemberPricingResult {
  priceToUse: number;
  isMemberPrice: boolean;
  originalPrice: number;
  memberPrice: number | null;
  memberSavings: number;
}

export const calculateMemberPricing = async (
  client: Pool | any,
  productId: string,
  customerId: string | null,
): Promise<MemberPricingResult> => {
  // Get product details
  const productResult = await client.query(
    "SELECT price, member_price FROM products WHERE id = $1",
    [productId],
  );

  if (productResult.rows.length === 0) {
    throw new Error("Product not found");
  }

  const product = productResult.rows[0];
  const originalPrice = parseFloat(product.price);
  const memberPrice = product.member_price
    ? parseFloat(product.member_price)
    : null;

  // If no customer, use regular price
  if (!customerId) {
    return {
      priceToUse: originalPrice,
      isMemberPrice: false,
      originalPrice,
      memberPrice,
      memberSavings: 0,
    };
  }

  // Check if customer is a member
  const customerResult = await client.query(
    "SELECT is_member FROM customers WHERE id = $1",
    [customerId],
  );

  if (customerResult.rows.length === 0) {
    return {
      priceToUse: originalPrice,
      isMemberPrice: false,
      originalPrice,
      memberPrice,
      memberSavings: 0,
    };
  }

  const customer = customerResult.rows[0];
  const isCustomerMember = customer.is_member === true;

  // Apply member pricing if customer is member AND product has member price
  if (isCustomerMember && memberPrice !== null) {
    return {
      priceToUse: memberPrice,
      isMemberPrice: true,
      originalPrice,
      memberPrice,
      memberSavings: originalPrice - memberPrice,
    };
  }

  // Otherwise use regular price
  return {
    priceToUse: originalPrice,
    isMemberPrice: false,
    originalPrice,
    memberPrice,
    memberSavings: 0,
  };
};

/**
 * Get promo details and validate
 */
export interface PromoInfo {
  promoId: string;
  promoName: string;
  promoDiscountType: "amount" | "percentage";
  promoDiscountValue: number;
  promoAmount: number;
}

export const calculatePromoDiscount = async (
  client: Pool | any,
  promoId: string | null,
  subtotal: number,
): Promise<PromoInfo | null> => {
  if (!promoId) {
    return null;
  }

  // Get promo details
  const promoResult = await client.query(
    `SELECT id, name, discount_type, discount_value, min_transaction, max_discount, status, start_date, end_date
     FROM promos
     WHERE id = $1`,
    [promoId],
  );

  if (promoResult.rows.length === 0) {
    return null;
  }

  const promo = promoResult.rows[0];

  // Validate promo is active
  if (promo.status !== "active") {
    return null;
  }

  // Validate promo date range
  const today = new Date();
  const startDate = new Date(promo.start_date);
  const endDate = new Date(promo.end_date);

  if (today < startDate || today > endDate) {
    return null;
  }

  // Validate minimum transaction
  if (subtotal < parseFloat(promo.min_transaction || 0)) {
    return null;
  }

  // Calculate promo amount
  let promoAmount = 0;
  if (promo.discount_type === "percentage") {
    promoAmount = (subtotal * parseFloat(promo.discount_value)) / 100;
  } else {
    promoAmount = parseFloat(promo.discount_value);
  }

  // Apply max discount if specified
  if (promo.max_discount && promoAmount > parseFloat(promo.max_discount)) {
    promoAmount = parseFloat(promo.max_discount);
  }

  // Increment usage count
  await client.query(
    "UPDATE promos SET usage_count = usage_count + 1 WHERE id = $1",
    [promoId],
  );

  return {
    promoId: promo.id,
    promoName: promo.name,
    promoDiscountType: promo.discount_type,
    promoDiscountValue: parseFloat(promo.discount_value),
    promoAmount,
  };
};

/**
 * Get payment method ID by name (for backward compatibility)
 */
export const getPaymentMethodId = async (
  client: Pool | any,
  paymentMethodName: string,
): Promise<string | null> => {
  const result = await client.query(
    "SELECT id FROM payment_methods WHERE name = $1 AND status = $2",
    [paymentMethodName, "active"],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

/**
 * Get payment method ID by name (for backward compatibility)
 */
type PaymentMethod = {
  id: string;
  name: string;
};

export const getPaymentMethodById = async (
  client: Pool,
  paymentMethodId: string,
): Promise<PaymentMethod | null> => {
  const result = await client.query(
    "SELECT id, name FROM payment_methods WHERE id = $1 AND status = $2",
    [paymentMethodId, "active"],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as PaymentMethod;
};

/**
 * Get payment method ID from request (supports both ID and name)
 */
export const resolvePaymentMethodId = async (
  client: Pool | any,
  paymentMethodInput: string,
): Promise<string | null> => {
  // First try as UUID (direct ID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(paymentMethodInput)) {
    const result = await client.query(
      "SELECT id FROM payment_methods WHERE id = $1 AND status = $2",
      [paymentMethodInput, "active"],
    );
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  // Otherwise treat as name
  return await getPaymentMethodId(client, paymentMethodInput);
};

/**
 * Calculate total member savings from all items
 */
export const calculateTotalMemberSavings = (items: any[]): number => {
  return items.reduce((total, item) => {
    const savings = parseFloat(item.member_savings || 0);
    return total + savings;
  }, 0);
};

/**
 * Check if customer is a member
 */
export const isCustomerMember = async (
  client: Pool | any,
  customerId: string | null,
): Promise<boolean> => {
  if (!customerId) {
    return false;
  }

  const result = await client.query(
    "SELECT is_member FROM customers WHERE id = $1",
    [customerId],
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].is_member;
};
